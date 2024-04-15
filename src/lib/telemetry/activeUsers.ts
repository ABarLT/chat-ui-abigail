import { metrics } from "@opentelemetry/api";
import NodeCache from "node-cache";
import { collections } from "../server/database";

export const setupActiveUserTelemetry = () => {
	const meter = metrics.getMeter("chat-ui");
	const activeUsers = meter.createObservableCounter("active_users");

	const cache = new NodeCache({ stdTTL: 60 * 60 });

	activeUsers.addCallback(async (result) => {
		for (const { since, label } of [
			{ since: new Date(Number(new Date()) - 1000 * 60 * 60 * 24), label: "daily" },
			{ since: new Date(Number(new Date()) - 1000 * 60 * 60 * 24 * 7), label: "weekly" },
			{ since: new Date(Number(new Date()) - 1000 * 60 * 60 * 24 * 30), label: "monthly" },
		]) {
			const cached = cache.get(since.toISOString()) as number;
			if (cached) {
				result.observe(cached);
			}

			const activeUsersQuery = collections.conversations.aggregate([
				{
					$unwind: "$messages",
				},
				{
					$match: {
						"messages.createdAt": { $gte: since },
						"messages.from": "user",
					},
				},
				{
					$group: {
						_id: "$userId",
					},
				},
				{
					$count: "total_users",
				},
			]);

			if (await activeUsersQuery.hasNext()) {
				const r = await activeUsersQuery.next();
				if (r) {
					cache.set(since.toISOString(), r.total_users);
					result.observe(r.total_users, { period: label });
				}
			}
		}
	});
};
