import { count, documentParsingError } from "./store";

export function setCount(value: number) {
	count.set(value + 1);
}

export function setDocumentParsingError(value: string) {
	console.log("Setting document parsing error using the store function");
	documentParsingError.set(value);
}
