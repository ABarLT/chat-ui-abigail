import { z } from "zod";
import type { Endpoint } from "../endpoints";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import {
	BedrockRuntimeClient,
	InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

export const endpointBedrockParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	type: z.literal("bedrock"),
	region: z.string().default("us-east-1"),
	model: z.any(),
	anthropicVersion: z.string().default("bedrock-2023-05-31"),
});

export async function endpointBedrock(
	input: z.input<typeof endpointBedrockParametersSchema>
): Promise<Endpoint> {
	const client = new BedrockRuntimeClient({
		region: input.region,
	});

	return async ({ messages, preprompt, generateSettings }) => {
		let system = preprompt;
		if (messages?.[0]?.from === "system") {
			system = messages[0].content;
		}
		const messagesFormatted = messages
			.filter((message) => message.from !== "system")
			.map((message) => ({
				role: message.from,
				content: [
					{
						type: "text",
						text: message.content,
					},
				],
			}));

		let tokenId = 0;
		const parameters = { ...input.model.parameters, ...generateSettings };

		return (async function* () {
			const command = new InvokeModelWithResponseStreamCommand({
				body: Buffer.from(
					JSON.stringify({
						anthropic_version: input.anthropicVersion,
						max_tokens: parameters.max_new_tokens ? parameters.max_new_tokens : 4096,
						messages: messagesFormatted,
						system,
					}),
					"utf-8"
				),
				contentType: "application/json",
				accept: "application/json",
				modelId: input.model.name,
				trace: "DISABLED",
			});

			const response = await client.send(command);

			let text = "";

			for await (const item of response.body ?? []) {
				const chunk = JSON.parse(new TextDecoder().decode(item.chunk?.bytes));
				const chunk_type = chunk.type;

				if (chunk_type === "content_block_delta") {
					text += chunk.delta.text;
					yield {
						token: {
							id: tokenId++,
							text: chunk.delta.text,
							logprob: 0,
							special: false,
						},
						generated_text: null,
						details: null,
					} satisfies TextGenerationStreamOutput;
				} else if (chunk_type === "message_stop") {
					yield {
						token: {
							id: tokenId++,
							text: "",
							logprob: 0,
							special: false,
						},
						generated_text: text,
						details: null,
					} satisfies TextGenerationStreamOutput;
				}
			}
		})();
	};
}
