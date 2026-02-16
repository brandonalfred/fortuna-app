import type { Prisma } from "@prisma/client";
import { ChatEventBuffer } from "@/lib/persistence/event-buffer";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PersistEvent {
	type: string;
	data: Prisma.InputJsonValue;
	seq: number;
}

interface PersistBody {
	chatId: string;
	events: PersistEvent[];
	agentSessionId?: string;
	turnComplete?: boolean;
	isComplete?: boolean;
}

export async function POST(req: Request): Promise<Response> {
	const authHeader = req.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return new Response("Unauthorized", { status: 401 });
	}
	const token = authHeader.slice(7);

	const body = (await req.json()) as PersistBody;
	const { chatId, events, agentSessionId, turnComplete, isComplete } = body;

	if (!chatId || !Array.isArray(events)) {
		return new Response("Bad request", { status: 400 });
	}

	const chat = await prisma.chat.findUnique({
		where: { persistToken: token },
		select: { id: true, lastSequenceNum: true },
	});

	if (!chat || chat.id !== chatId) {
		return new Response("Forbidden", { status: 403 });
	}

	const newEvents = events.filter((e) => e.seq > chat.lastSequenceNum);
	if (newEvents.length > 0) {
		const buffer = new ChatEventBuffer(chatId, chat.lastSequenceNum);
		for (const event of newEvents) {
			buffer.appendEvent(event.type, event.data);
		}
		await buffer.flush();
	}

	if (turnComplete || isComplete) {
		const updateData: Prisma.ChatUpdateInput = {
			isProcessing: false,
			...(agentSessionId && { agentSessionId }),
			...(isComplete && { streamToken: null, persistToken: null }),
		};

		await prisma.chat.update({
			where: { id: chatId },
			data: updateData,
		});
	}

	return Response.json({ ok: true });
}
