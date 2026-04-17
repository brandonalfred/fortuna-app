import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function getUserClaudeToken(
	userId: string,
): Promise<string | null> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { claudeOauthTokenEncrypted: true },
	});
	if (!user?.claudeOauthTokenEncrypted) return null;
	return decryptSecret(user.claudeOauthTokenEncrypted);
}
