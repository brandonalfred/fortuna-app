export const MAX_TOOL_RESULT_DB_LIMIT = 2000;

interface ContentBlock {
	type: string;
	text?: string;
	content?: unknown;
	is_error?: boolean;
}

function isContentBlock(value: unknown): value is ContentBlock {
	return typeof value === "object" && value !== null && "type" in value;
}

function extractTextParts(content: unknown): string[] {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];

	const parts: string[] = [];
	for (const inner of content) {
		if (isContentBlock(inner) && inner.type === "text" && inner.text) {
			parts.push(inner.text);
		}
	}
	return parts;
}

export function extractToolResultContent(msg: {
	message: { content: unknown };
}): string {
	const content = msg.message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const block of content) {
		if (!isContentBlock(block)) continue;

		if (block.type === "tool_result") {
			parts.push(...extractTextParts(block.content));
		} else if (block.type === "text" && block.text) {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

export function extractIsError(content: unknown): boolean {
	if (!Array.isArray(content)) return false;
	return content.some(
		(block) =>
			isContentBlock(block) &&
			block.type === "tool_result" &&
			block.is_error === true,
	);
}
