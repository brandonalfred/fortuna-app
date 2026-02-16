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

	if (chat.sandboxId) {
		try {
			const sandbox = await Sandbox.get({ sandboxId: chat.sandboxId });
			const streamUrl = sandbox.domain(8080);

			const stopRes = await fetch(`${streamUrl}/stop`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			}).catch(() => null);

			if (!stopRes || !stopRes.ok) {
				console.warn(
					`[Stop API] SSE server unresponsive, stopping sandbox chat=${id}`,
				);
				await sandbox.stop();
				await prisma.chat.update({
					where: { id },
					data: {
						sandboxId: null,
						streamToken: null,
						persistToken: null,
					},
				});
			}
		} catch (e) {
			console.warn(`[Stop API] Sandbox stop failed chat=${id}:`, e);
		}
	}

	const controller = activeSessions.get(id);
	if (controller) {
		controller.abort();
		activeSessions.delete(id);
		console.log(`[Stop API] Aborted in-memory session chat=${id}`);
	}

	await prisma.chat.update({
		where: { id },
		data: { isProcessing: false },
	});

	return new Response(null, { status: 204 });
}
