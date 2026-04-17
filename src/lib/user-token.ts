import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function getUserClaudeToken(
	userId: string,
): Promise<string | null> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { claudeOauthTokenEncrypted: true },
	});
	if (!user?.claudeOauthTokenEncrypted) return null;
	try {
		return decryptSecret(user.claudeOauthTokenEncrypted);
	} catch {
		return null;
	}
}

export async function setUserClaudeToken(
	userId: string,
	plaintext: string | null,
): Promise<void> {
	const encrypted = plaintext === null ? null : encryptSecret(plaintext);
	await prisma.user.update({
		where: { id: userId },
		data: {
			claudeOauthTokenEncrypted: encrypted,
			hasClaudeToken: encrypted !== null,
		},
	});
}
