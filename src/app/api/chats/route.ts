import { randomUUID } from "node:crypto";
import { badRequest, getAuthenticatedUser, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createChatSchema } from "@/lib/validations/chat";

export async function GET(): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const chats = await prisma.chat.findMany({
		where: { userId: user.id },
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

export async function POST(req: Request): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const body = await req.json();
	const parsed = createChatSchema.safeParse(body);

	if (!parsed.success) {
		return badRequest("Invalid request", parsed.error.flatten());
	}

	const chat = await prisma.chat.create({
		data: {
			sessionId: randomUUID(),
			title: parsed.data.title || "New Chat",
			userId: user.id,
		},
	});

	return Response.json(chat, { status: 201 });
}
