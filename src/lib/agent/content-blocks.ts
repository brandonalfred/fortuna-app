import { isImageMimeType } from "@/lib/r2";
import type { Attachment } from "@/lib/types";

export type MessageContentBlock =
	| { type: "image"; source: { type: "url"; url: string } }
	| { type: "document"; source: { type: "url"; url: string } }
	| { type: "text"; text: string };

export function buildContentBlocks(
	message: string,
	attachments?: Attachment[],
): MessageContentBlock[] {
	const content: MessageContentBlock[] = [];

	for (const att of attachments ?? []) {
		if (!att.url) continue;

		if (isImageMimeType(att.mimeType)) {
			content.push({
				type: "image",
				source: { type: "url", url: att.url },
			});
		} else if (att.mimeType === "application/pdf") {
			content.push({
				type: "document",
				source: { type: "url", url: att.url },
			});
		}
	}

	if (message) {
		content.push({ type: "text", text: message });
	}
	return content;
}
