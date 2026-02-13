import {
	badRequest,
	getAuthenticatedUser,
	notFound,
	unauthorized,
} from "@/lib/api";
import { eventsToMessages } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { regenerateAttachmentUrls } from "@/lib/r2";
import type { Message } from "@/lib/types";
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
			events: {
				orderBy: { sequenceNum: "asc" },
			},
		},
	});

	if (!chat) {
		return notFound("Chat");
	}

	const { events, ...rest } = chat;
	const useEvents = chat.storageVersion === 2 && events.length > 0;
	const messages = useEvents ? eventsToMessages(events) : rest.messages;

	const refreshed = await Promise.all(
		messages.map(async (msg) => {
			const attachments = (msg as Message).attachments;
			if (attachments && attachments.length > 0) {
				return {
					...msg,
					attachments: await regenerateAttachmentUrls(attachments),
				};
			}
			return msg;
		}),
	);

	return Response.json({
		...rest,
		messages: refreshed,
	});
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
