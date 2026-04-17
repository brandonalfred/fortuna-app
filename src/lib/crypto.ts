import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
	if (cachedKey) return cachedKey;
	const raw = process.env.TOKEN_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error("TOKEN_ENCRYPTION_KEY env var is required");
	}
	const key = Buffer.from(raw, "base64");
	if (key.length !== KEY_LEN) {
		throw new Error(
			`TOKEN_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${key.length})`,
		);
	}
	cachedKey = key;
	return key;
}

export function encryptSecret(plain: string): string {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plain, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	const blob = Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
	return blob.toString("base64");
}

export function decryptSecret(blob: string): string {
	const buf = Buffer.from(blob, "base64");
	if (buf.length < 1 + IV_LEN + TAG_LEN) {
		throw new Error("Encrypted blob is too short");
	}
	const version = buf[0];
	if (version !== VERSION) {
		throw new Error(`Unsupported encryption version: ${version}`);
	}
	const iv = buf.subarray(1, 1 + IV_LEN);
	const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
	const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);
	const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

export function redactToken(token: string): string {
	if (token.length <= 11) return "•••";
	return `${token.slice(0, 7)}•••••••${token.slice(-4)}`;
}
