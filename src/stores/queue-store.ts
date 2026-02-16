import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { createLogger } from "@/lib/logger";
import type { Attachment, QueuedMessage } from "@/lib/types";

const log = createLogger("QueueStore");

interface QueueState {
	pendingMessages: QueuedMessage[];
}

interface QueueActions {
	enqueue(content: string, attachments?: Attachment[]): void;
	dequeue(): QueuedMessage | undefined;
	remove(id: string): void;
	clear(): void;
}

export type QueueStore = QueueState & QueueActions;

export function createQueueStore() {
	return createStore<QueueStore>()(
		persist(
			(set, get) => ({
				pendingMessages: [],

				enqueue(content: string, attachments?: Attachment[]) {
					const msg: QueuedMessage = {
						id: crypto.randomUUID(),
						content,
						attachments: attachments?.map(({ url: _, ...rest }) => rest),
					};
					log.info("Enqueue", { id: msg.id, preview: content.slice(0, 50) });
					set({ pendingMessages: [...get().pendingMessages, msg] });
				},

				dequeue() {
					const { pendingMessages } = get();
					if (pendingMessages.length === 0) return undefined;
					const [next, ...rest] = pendingMessages;
					log.info("Dequeue", { id: next.id });
					set({ pendingMessages: rest });
					return next;
				},

				remove(id: string) {
					set({
						pendingMessages: get().pendingMessages.filter((m) => m.id !== id),
					});
				},

				clear() {
					set({ pendingMessages: [] });
				},
			}),
			{
				name: "fortuna-message-queue",
				skipHydration: true,
				partialize: (state) => ({
					pendingMessages: state.pendingMessages,
				}),
			},
		),
	);
}
