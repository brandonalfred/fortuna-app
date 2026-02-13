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

	if (attachments) {
		for (const att of attachments) {
			if (isImageMimeType(att.mimeType) && att.url) {
				content.push({
					type: "image",
					source: { type: "url", url: att.url },
				});
			} else if (att.mimeType === "application/pdf" && att.url) {
				content.push({
					type: "document",
					source: { type: "url", url: att.url },
				});
			}
		}
	}

	content.push({ type: "text", text: message });
	return content;
}
