import { badRequest, getAuthenticatedUser, unauthorized } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateChatTitle } from "@/lib/title-generator";
import { generateTitleSchema } from "@/lib/validations/chat";

export const maxDuration = 10;

const log = createLogger("TitleGeneration");

export async function POST(req: Request): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const body = await req.json();
	const parsed = generateTitleSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest("Invalid request", parsed.error.flatten());
	}

	const { message, chatId } = parsed.data;
	log.info("Generating title", { chatId, messageLen: message.length });
	const title = await generateChatTitle(message);
	log.info("Title result", { chatId, title: title ?? "null" });

	if (title) {
		await prisma.chat
			.update({
				where: { id: chatId, userId: user.id },
				data: { title },
			})
			.catch((err) => log.error("DB update failed", err));
	}

	return Response.json({ title });
}
