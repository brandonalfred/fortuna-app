import { prisma } from "@/lib/prisma";
import { updateChatSchema } from "@/lib/validations/chat";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
	const { id } = await params;

	const chat = await prisma.chat.findUnique({
		where: { id },
		include: {
			messages: {
				orderBy: { createdAt: "asc" },
			},
		},
	});

	if (!chat) {
		return Response.json({ error: "Chat not found" }, { status: 404 });
	}

	return Response.json(chat);
}

export async function PATCH(req: Request, { params }: RouteParams) {
	const { id } = await params;
	const body = await req.json();
	const parsed = updateChatSchema.safeParse(body);

	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const chat = await prisma.chat.update({
		where: { id },
		data: { title: parsed.data.title },
	});

	return Response.json(chat);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
	const { id } = await params;

	await prisma.chat.delete({
		where: { id },
	});

	return new Response(null, { status: 204 });
}
