import type { MessageFile } from "../../types/Message";
import { env } from "$env/dynamic/private";

const supportedDocumentMimeTypes = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/markdown",
	"application/vnd.ms-outlook",
	"text/*",
	"application/json",
];

export function mimeToExtension(mimeType: string): string {
	const mimeToExt: { [key: string]: string } = {
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
		"application/pdf": "pdf",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
		"text/markdown": "md",
		"application/vnd.ms-outlook": "msg",
		"text/*": "text/*",
		"application/json": "json",
	};
	return mimeToExt[mimeType] || mimeType.split("/")[1].split("+")[0];
}

async function convertBlobToString(fileBlob: Blob): Promise<string> {
	// Convert Blob to text
	const text = await fileBlob.text();
	return text;
}

export async function processTextDocument(file: MessageFile): Promise<string> {
	// Convert base64 to Blob
	const fileBlob = await fetch(`data:${file.mime};base64,${file.value}`).then((res) => res.blob());

	// Create a filename with the correct extension
	const extension = mimeToExtension(file.mime);
	const filename = `${file.name}.${extension}`;

	let parsedText = "";

	if (fileBlob.size > parseInt(env.MAX_FILE_SIZE)) {
		throw new Error(
			`The file size exceeds the maximum limit of ${parseInt(env.MAX_FILE_SIZE) / (1024 * 1024)}MB.`
		);
	}

	if (file.mime.startsWith("text/")) {
		parsedText = await convertBlobToString(fileBlob);
	} else if (file.mime === "application/json") {
		const textContent = await convertBlobToString(fileBlob);
		parsedText = `\`\`\`json\n${textContent}\n\`\`\``;
	} else {
		// Create FormData and append the file
		const formData = new FormData();
		formData.append("file", fileBlob, filename);

		try {
			// Send the request to FastAPI
			const response = await fetch(env.DOC_PARSER_API_URL, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				if (response.status === 413) {
					throw new Error(
						`File exceeds the max size of ${parseInt(env.MAX_FILE_SIZE) / (1024 * 1024)}MB.`
					);
				}
				throw new Error(`Failed to parse document: ${response.statusText}`);
			}

			parsedText = await response.text();
		} catch (error) {
			if (error instanceof Error) {
				const errorMessage = `An error occurred while processing the document: ${error.message}`;
				throw new Error(errorMessage);
			} else {
				throw new Error("An unexpected error occurred while processing the document.");
			}
		}
	}

	// Truncate long documents (adjust the limit as needed) TODO: do this based on tokenization
	if (parsedText.length > 300_000) {
		parsedText = parsedText.slice(0, 300_000) + "\n\n... (truncated)";
		parsedText = `<${filename}>${parsedText}</${filename}>`;
		// Add instructions to the model to inform the user that the document was truncated
		parsedText =
			parsedText +
			"<instructions>Start your response with this exact sentence that is enclosed in the phrase XML tags. Don't include the XML tags themselves in your response. <phrase>A long document was truncated to fit model context limitations.</phrase>. Then give the rest of your response as you normally would. </instructions>";
	} else {
		// Concatenate the filename to the beginning of the parsed text to give model better context
		// inputted with XML tags for parsability
		parsedText = `<${filename}>${parsedText}</${filename}>`;
	}
	return parsedText;
}
export { supportedDocumentMimeTypes };
