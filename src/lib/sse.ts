import { createLogger } from "@/lib/logger";

const log = createLogger("SSE");

export interface SSEEvent {
	id: string;
	type: string;
	data: unknown;
}

export async function* parseSSEStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSEEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	let currentEventType = "";
	let currentEventId = "";
	let eventCounter = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			if (line.startsWith("event: ")) {
				currentEventType = line.slice(7);
			} else if (line.startsWith("id: ")) {
				currentEventId = line.slice(4);
			} else if (line.startsWith("data: ")) {
				try {
					const data = JSON.parse(line.slice(6));
					const id = currentEventId || `sse-${++eventCounter}`;
					log.debug("Event", { id, type: currentEventType });
					yield { id, type: currentEventType, data };
					currentEventId = "";
				} catch {
					log.warn("Failed to parse data line", {
						preview: line.slice(6, 100),
					});
				}
			}
		}
	}
}

export function createDeduplicator(): {
	isDuplicate(id: string): boolean;
} {
	const seen = new Set<string>();

	return {
		isDuplicate(id) {
			if (seen.has(id)) return true;
			seen.add(id);
			return false;
		},
	};
}
