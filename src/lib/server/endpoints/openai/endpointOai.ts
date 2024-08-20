import { z } from "zod";
import { openAICompletionToTextGenerationStream } from "./openAICompletionToTextGenerationStream";
import { openAIChatToTextGenerationStream } from "./openAIChatToTextGenerationStream";
import type { CompletionCreateParamsStreaming } from "openai/resources/completions";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { buildPrompt } from "$lib/buildPrompt";
import { env } from "$env/dynamic/private";
import type { Endpoint } from "../endpoints";
import type OpenAI from "openai";
import { createImageProcessorOptionsValidator, makeImageProcessor } from "../images";
import type { MessageFile } from "$lib/types/Message";
import type { EndpointMessage } from "../endpoints";

export const endpointOAIParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("openai"),
	baseURL: z.string().url().default("https://api.openai.com/v1"),
	apiKey: z.string().default(env.OPENAI_API_KEY ?? "sk-"),
	completion: z
		.union([z.literal("completions"), z.literal("chat_completions")])
		.default("chat_completions"),
	defaultHeaders: z.record(z.string()).optional(),
	defaultQuery: z.record(z.string()).optional(),
	extraBody: z.record(z.any()).optional(),
	multimodal: z
		.object({
			image: createImageProcessorOptionsValidator({
				supportedMimeTypes: [
					"image/png",
					"image/jpeg",
					"image/webp",
					"image/avif",
					"image/tiff",
					"image/gif",
				],
				preferredMimeType: "image/webp",
				maxSizeInMB: Infinity,
				maxWidth: 4096,
				maxHeight: 4096,
			}),
		})
		.default({}),
});

export async function endpointOai(
	input: z.input<typeof endpointOAIParametersSchema>
): Promise<Endpoint> {
	const {
		baseURL,
		apiKey,
		completion,
		model,
		defaultHeaders,
		defaultQuery,
		multimodal,
		extraBody,
	} = endpointOAIParametersSchema.parse(input);

	/* eslint-disable-next-line no-shadow */
	let OpenAI;
	try {
		OpenAI = (await import("openai")).OpenAI;
	} catch (e) {
		throw new Error("Failed to import OpenAI", { cause: e });
	}

	const openai = new OpenAI({
		apiKey: apiKey ?? "sk-",
		baseURL,
		defaultHeaders,
		defaultQuery,
	});

	const imageProcessor = makeImageProcessor(multimodal.image);

	if (completion === "completions") {
		return async ({ messages, preprompt, continueMessage, generateSettings }) => {
			const prompt = await buildPrompt({
				messages,
				continueMessage,
				preprompt,
				model,
			});

			const parameters = { ...model.parameters, ...generateSettings };
			const body: CompletionCreateParamsStreaming = {
				model: model.id ?? model.name,
				prompt,
				stream: true,
				max_tokens: parameters?.max_new_tokens,
				stop: parameters?.stop,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.repetition_penalty,
			};

			const openAICompletion = await openai.completions.create(body, {
				body: { ...body, ...extraBody },
			});

			return openAICompletionToTextGenerationStream(openAICompletion);
		};
	} else if (completion === "chat_completions") {
		return async ({ messages, preprompt, generateSettings }) => {
			let messagesOpenAI: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
				await prepareMessages(messages, imageProcessor);

			if (messagesOpenAI?.[0]?.role !== "system") {
				messagesOpenAI = [{ role: "system", content: "" }, ...messagesOpenAI];
			}

			if (messagesOpenAI?.[0]) {
				messagesOpenAI[0].content = preprompt ?? "";
			}

			const parameters = { ...model.parameters, ...generateSettings };
			const body: ChatCompletionCreateParamsStreaming = {
				model: model.id ?? model.name,
				messages: messagesOpenAI,
				stream: true,
				max_tokens: parameters?.max_new_tokens,
				stop: parameters?.stop,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.repetition_penalty,
			};

			const openChatAICompletion = await openai.chat.completions.create(body, {
				body: { ...body, ...extraBody },
			});

			return openAIChatToTextGenerationStream(openChatAICompletion);
		};
	} else {
		throw new Error("Invalid completion type");
	}
}

async function prepareMessages(
	messages: EndpointMessage[],
	imageProcessor: ReturnType<typeof makeImageProcessor>
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
	return Promise.all(
		messages.map(async (message) => {
			if (message.from === "user") {
				const processedFiles = await prepareFiles(imageProcessor, message.files ?? []);
				const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
					...processedFiles,
					{ type: "text", text: message.content },
				];

				return {
					role: message.from,
					content: content.filter((item) =>
						item.type === "text" ? item.text.trim() !== "" : true
					),
				} as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
			}
			return {
				role: message.from,
				content: message.content,
			} as
				| OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam
				| OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;
		})
	);
}

async function prepareFiles(
	imageProcessor: ReturnType<typeof makeImageProcessor>,
	files: MessageFile[]
): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
	console.log("prepareFiles input:", files);
	return Promise.all(
		files.map(async (file) => {
			console.log("File type:", file.type);
			console.log("File value type:", typeof file.value);
			console.log("File mime:", file.mime);
			if (file.mime.startsWith("image/")) {
				// For images, we assume the value is a base64 string
				if (typeof file.value !== "string") {
					throw new Error("Image files must be provided as base64 strings");
				}
				const processedImage = await imageProcessor(file);
				return {
					type: "image_url" as const,
					image_url: {
						url: `data:${processedImage.mime};base64,${processedImage.image.toString("base64")}`,
					},
				};
			} else if (
				[
					"application/pdf",
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					"text/markdown",
					"application/vnd.ms-outlook",
				].includes(file.mime)
			) {
				// For text documents, we need to handle both string and Blob values
				// let textContent: string;
				// if (typeof file.value === "string") {
				// 	// If it's a string, we assume it's already the text content
				// 	console.log("FILE WAS ALREADY A STRING in preparefiles");
				// 	const fileBlob = await fetch(`data:${file.mime};base64,${file.value}`).then((res) =>
				// 		res.blob()
				// 	);
				// 	textContent = await processTextDocument(fileBlob);
				// } else if (file.value instanceof Blob) {
				// 	// If it's a Blob, we need to process it
				const textContent = await processTextDocument(file);
				// } else {
				// 	throw new Error("Invalid file value type");
				// }
				return { type: "text" as const, text: textContent };
			} else {
				throw new Error(`Unsupported file type: ${file.mime}`);
			}
		})
	);
}
async function processTextDocument(file: MessageFile): Promise<string> {
	console.log("File name:", file.name);
	console.log("File type:", file.type);

	// Convert base64 to Blob
	const fileBlob = await fetch(`data:${file.mime};base64,${file.value}`).then((res) => res.blob());

	// Create a filename based on the file type
	let filename = file.name;
	if (!filename.includes(".")) {
		const extension = file.mime.split("/")[1];
		console.log("Extension:", extension);
		filename = `${file.name}.${extension}`;
	}

	// Create FormData and append the file
	const formData = new FormData();
	formData.append("file", fileBlob, filename);

	// Send the request to FastAPI
	const response = await fetch("http://localhost:8000/", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Failed to parse document: ${response.statusText}`);
	}

	let parsedText = await response.text();

	// Truncate long documents (adjust the limit as needed)
	if (parsedText.length > 30_000) {
		parsedText = parsedText.slice(0, 30_000) + "\n\n... (truncated)";
	}

	return parsedText;
}

// async function processTextDocument(fileOrContent: Blob | string): Promise<string> {
// 	let file: File;
// 	if (typeof fileOrContent === "string") {
// 		// If it's a string, assume it's a data URL
// 		const [header, base64Data] = fileOrContent.split(",");
// 		const [, mimeType] = header.match(/^data:(.*?);base64$/) || [];

// 		if (!mimeType) {
// 			throw new Error("Invalid data URL");
// 		}

// 		// Convert base64 to blob
// 		const byteCharacters = atob(base64Data);
// 		const byteNumbers = new Array(byteCharacters.length);
// 		for (let i = 0; i < byteCharacters.length; i++) {
// 			byteNumbers[i] = byteCharacters.charCodeAt(i);
// 		}
// 		const byteArray = new Uint8Array(byteNumbers);
// 		const blob = new Blob([byteArray], { type: mimeType });

// 		// Extract file extension from MIME type
// 		const fileExtension = mimeType.split("/")[1];
// 		file = new File([blob], `document.${fileExtension}`, { type: mimeType });
// 	} else if (fileOrContent instanceof Blob) {
// 		// If it's already a Blob, just convert to File
// 		const fileExtension = fileOrContent.type.split("/")[1];
// 		file = new File([fileOrContent], `document.${fileExtension}`, { type: fileOrContent.type });
// 	} else {
// 		throw new Error("Invalid file content");
// 	}

// 	console.log("File name:", file.name);
// 	console.log("File size:", file.size, "bytes");
// 	console.log("File type:", file.type);

// 	const url = "http://localhost:8000/";
// 	const formData = new FormData();
// 	formData.append("file", file);

// 	try {
// 		const response = await fetch(url, {
// 			method: "POST",
// 			body: formData,
// 		});

// 		if (!response.ok) {
// 			const errorText = await response.text();
// 			console.error("Server responded with:", response.status, errorText);
// 			throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
// 		}

// 		const responseText = await response.text();
// 		console.log("RESPONSE TEXT", responseText);
// 		return responseText;
// 	} catch (error) {
// 		console.error("Error processing document:", error);
// 		throw error;
// 	}
// }
