import { Sandbox } from "@vercel/sandbox";
import { activeSessions } from "@/lib/agent/active-sessions";
import { logSandboxUsage, SANDBOX_SSE_PORT } from "@/lib/agent/sandbox";
import { getAuthenticatedUser, notFound, unauthorized } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = createLogger("StopAPI");

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

	let sandboxStopSucceeded = false;

	if (chat.sandboxId) {
		try {
			const sandbox = await Sandbox.get({ sandboxId: chat.sandboxId });
			const streamUrl = sandbox.domain(SANDBOX_SSE_PORT);

			const stopRes = await fetch(`${streamUrl}/stop`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${chat.streamToken}`,
				},
				signal: AbortSignal.timeout(5000),
			}).catch(() => null);

			if (stopRes?.ok) {
				sandboxStopSucceeded = true;
			} else {
				log.warn("SSE server unresponsive, stopping sandbox", { chatId: id });
				await sandbox.stop();
				logSandboxUsage(chat.sandboxId, id, "user_stop");
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
			log.error("Sandbox stop failed", e);
		}
	}

	const controller = activeSessions.get(id);
	if (controller) {
		controller.abort();
		activeSessions.delete(id);
		log.info("Aborted in-memory session", { chatId: id });
	}

	const updateData: {
		isProcessing: boolean;
		streamToken?: null;
		persistToken?: null;
	} = {
		isProcessing: false,
	};

	if (!sandboxStopSucceeded) {
		updateData.streamToken = null;
		updateData.persistToken = null;
	}

	// Append a result event with user_stopped so the stop notice renders
	// when the chat is loaded from persisted events.
	if (chat.storageVersion === 2) {
		const lastEvent = await prisma.chatEvent.findFirst({
			where: { chatId: id },
			orderBy: { sequenceNum: "desc" },
			select: { sequenceNum: true },
		});

		const nextSeq = (lastEvent?.sequenceNum ?? 0) + 1;
		await prisma.chatEvent.create({
			data: {
				chatId: id,
				type: "result",
				data: { stopReason: "user_stopped", subtype: "user_stopped" },
				sequenceNum: nextSeq,
			},
		});
		await prisma.chat.update({
			where: { id },
			data: { lastSequenceNum: nextSeq },
		});
	} else {
		// Legacy v1: update the message directly
		const lastAssistantMessage = await prisma.message.findFirst({
			where: { chatId: id, role: "assistant" },
			orderBy: { createdAt: "desc" },
			select: { id: true, stopReason: true },
		});

		if (lastAssistantMessage && !lastAssistantMessage.stopReason) {
			await prisma.message.update({
				where: { id: lastAssistantMessage.id },
				data: { stopReason: "user_stopped" },
			});
		}
	}

	await prisma.chat.update({
		where: { id },
		data: updateData,
	});

	return new Response(null, { status: 204 });
}
