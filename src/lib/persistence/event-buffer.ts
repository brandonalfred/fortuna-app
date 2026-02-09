import type { Prisma } from "@prisma/client";
import { prisma, retryOnTransientError } from "@/lib/prisma";

interface PendingEvent {
	type: string;
	data: Prisma.InputJsonValue;
}

const SAFETY_FLUSH_MS = 5000;

export class ChatEventBuffer {
	private chatId: string;
	private nextSequenceNum: number;
	private textBuffer = "";
	private pendingEvents: PendingEvent[] = [];
	private flushInFlight = false;
	private safetyTimerId: ReturnType<typeof setInterval> | null = null;

	constructor(chatId: string, initialSequenceNum: number) {
		this.chatId = chatId;
		this.nextSequenceNum = initialSequenceNum;
	}

	get sequenceNum(): number {
		return this.nextSequenceNum;
	}

	appendText(text: string): void {
		this.textBuffer += text;
	}

	appendEvent(type: string, data: Prisma.InputJsonValue): void {
		this.flushTextBuffer();
		this.pendingEvents.push({ type, data });
	}

	async flush(): Promise<void> {
		this.flushTextBuffer();
		await retryOnTransientError(() => this.flushEvents());
	}

	startSafetyTimer(): void {
		this.safetyTimerId = setInterval(() => {
			if (this.flushInFlight) return;
			if (this.textBuffer) {
				this.flushTextBuffer();
				this.flushEvents().catch((e) =>
					console.warn("[ChatEventBuffer] Safety flush failed:", e),
				);
			}
		}, SAFETY_FLUSH_MS);
	}

	async cleanup(): Promise<void> {
		if (this.safetyTimerId) clearInterval(this.safetyTimerId);
		this.flushTextBuffer();
		await this.flushEvents();
	}

	private flushTextBuffer(): void {
		if (!this.textBuffer) return;
		this.pendingEvents.push({
			type: "text",
			data: { content: this.textBuffer } satisfies Prisma.InputJsonValue,
		});
		this.textBuffer = "";
	}

	private async flushEvents(): Promise<void> {
		if (this.flushInFlight || this.pendingEvents.length === 0) return;
		this.flushInFlight = true;
		const batch = this.pendingEvents;
		this.pendingEvents = [];
		const startSeq = this.nextSequenceNum;
		const creates = batch.map((e, idx) =>
			prisma.chatEvent.create({
				data: {
					chatId: this.chatId,
					type: e.type,
					data: e.data,
					sequenceNum: startSeq + idx + 1,
				},
			}),
		);
		this.nextSequenceNum = startSeq + batch.length;
		try {
			await prisma.$transaction([
				...creates,
				prisma.chat.update({
					where: { id: this.chatId },
					data: { lastSequenceNum: this.nextSequenceNum },
				}),
			]);
		} catch (error) {
			this.pendingEvents.unshift(...batch);
			this.nextSequenceNum = startSeq;
			throw error;
		} finally {
			this.flushInFlight = false;
		}
	}
}
