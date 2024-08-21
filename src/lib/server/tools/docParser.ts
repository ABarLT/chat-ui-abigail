// docParser.ts

import type { MessageFile } from "../../types/Message";

const supportedDocumentMimeTypes = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/markdown",
	"application/vnd.ms-outlook",
];

function mimeToExtension(mimeType: string): string {
	const mimeToExt: { [key: string]: string } = {
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
		"application/pdf": "pdf",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
		"text/markdown": "md",
		"application/vnd.ms-outlook": "msg",
		// Add csv, excel
	};
	return mimeToExt[mimeType] || mimeType.split("/")[1].split("+")[0];
}

export async function processTextDocument(file: MessageFile): Promise<string> {
	console.log("File name:", file.name);
	console.log("File MIME:", file.mime);
	console.log("File type:", file.type);

	// Convert base64 to Blob
	const fileBlob = await fetch(`data:${file.mime};base64,${file.value}`).then((res) => res.blob());

	// Create a filename with the correct extension
	const extension = mimeToExtension(file.mime);
	const filename = `${file.name}.${extension}`;

	console.log("Final filename:", filename);

	// Create FormData and append the file
	const formData = new FormData();
	formData.append("file", fileBlob, filename);

	// Send the request to FastAPI
	// TODO: set the URL to a variable
	const response = await fetch("http://localhost:8000/", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Failed to parse document: ${response.statusText}`);
	}

	let parsedText = await response.text();

	// Truncate long documents (adjust the limit as needed) TODO: do this based on tokenization
	if (parsedText.length > 30_000) {
		parsedText = parsedText.slice(0, 30_000) + "\n\n... (truncated)";
	}

	// Concatenate the filename to the beginning of the parsed text to give model better context
	// inputted with XML tags for parsability
	parsedText = `<${filename}>${parsedText}</${filename}>`;

	console.log("Parsed text:", parsedText);

	return parsedText;
}

export { supportedDocumentMimeTypes };
