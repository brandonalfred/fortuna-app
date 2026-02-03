import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createChatSchema } from "@/lib/validations/chat";

export async function GET() {
	const chats = await prisma.chat.findMany({
		orderBy: { updatedAt: "desc" },
		select: {
			id: true,
			title: true,
			sessionId: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	return Response.json(chats);
}

export async function POST(req: Request) {
	const body = await req.json();
	const parsed = createChatSchema.safeParse(body);

	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const chat = await prisma.chat.create({
		data: {
			sessionId: randomUUID(),
			title: parsed.data.title || "New Chat",
		},
	});

	return Response.json(chat, { status: 201 });
}
