import { Sandbox } from "@vercel/sandbox";
import { activeSessions } from "@/lib/agent/active-sessions";
import { getAuthenticatedUser, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
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
	});

	if (!chat) {
		return notFound("Chat");
	}

	const controller = activeSessions.get(id);
	if (controller) {
		controller.abort();
		activeSessions.delete(id);
		console.log(`[Stop API] Aborted in-memory session chat=${id}`);
	}

	if (chat.sandboxId) {
		try {
			const sandbox = await Sandbox.get({ sandboxId: chat.sandboxId });
			await sandbox.stop();
			await prisma.chat.update({
				where: { id },
				data: { sandboxId: null },
			});
			console.log(`[Stop API] Stopped sandbox chat=${id}`);
		} catch (e) {
			console.warn(`[Stop API] Sandbox stop failed chat=${id}:`, e);
		}
	}

	await prisma.chat.update({
		where: { id },
		data: { isProcessing: false },
	});

	return new Response(null, { status: 204 });
}
