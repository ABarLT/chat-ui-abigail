import type { MessageFile } from "../../types/Message";
import { env } from "$env/dynamic/private";

const supportedDocumentMimeTypes = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/markdown",
	"application/vnd.ms-outlook",
	"text/csv",
];

export function mimeToExtension(mimeType: string): string {
	const mimeToExt: { [key: string]: string } = {
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
		"application/pdf": "pdf",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
		"text/markdown": "md",
		"application/vnd.ms-outlook": "msg",
		"text/csv": "csv",
	};
	return mimeToExt[mimeType] || mimeType.split("/")[1].split("+")[0];
}

async function convertCsvToString(fileBlob: Blob): Promise<string> {
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

	if (file.mime === "text/csv") {
		// Convert CSV to text string
		parsedText = await convertCsvToString(fileBlob);
	} else {
		// Create FormData and append the file
		const formData = new FormData();
		formData.append("file", fileBlob, filename);

		// Send the request to FastAPI
		const response = await fetch(env.DOC_PARSER_API_URL, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			throw new Error(`Failed to parse document: ${response.statusText}`);
		}

		parsedText = await response.text();
	}

	// Truncate long documents (adjust the limit as needed) TODO: do this based on tokenization
	if (parsedText.length > 300_000) {
		parsedText = parsedText.slice(0, 300_000) + "\n\n... (truncated)";
		parsedText = `<${filename}>${parsedText}</${filename}>`;
		// Add instructions to the model to inform the user that the document was truncated
		parsedText =
			parsedText +
			"<instructions>Inform the user that the document was truncated because it was too long before giving the rest of your response.</instructions>";
	} else {
		// Concatenate the filename to the beginning of the parsed text to give model better context
		// inputted with XML tags for parsability
		parsedText = `<${filename}>${parsedText}</${filename}>`;
	}
	return parsedText;
}

export { supportedDocumentMimeTypes };
