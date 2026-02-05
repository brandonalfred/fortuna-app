import {
	badRequest,
	getAuthenticatedUser,
	notFound,
	unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { updateChatSchema } from "@/lib/validations/chat";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
	_req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const { id } = await params;

	const chat = await prisma.chat.findUnique({
		where: { id, userId: user.id },
		include: {
			messages: {
				orderBy: { createdAt: "asc" },
			},
		},
	});

	if (!chat) {
		return notFound("Chat");
	}

	return Response.json(chat);
}

export async function PATCH(
	req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const { id } = await params;
	const body = await req.json();
	const parsed = updateChatSchema.safeParse(body);

	if (!parsed.success) {
		return badRequest("Invalid request", parsed.error.flatten());
	}

	const chat = await prisma.chat.update({
		where: { id, userId: user.id },
		data: { title: parsed.data.title },
	});

	return Response.json(chat);
}

export async function DELETE(
	_req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const { id } = await params;

	await prisma.chat.delete({
		where: { id, userId: user.id },
	});

	return new Response(null, { status: 204 });
}
