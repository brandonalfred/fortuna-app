import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Attachment } from "@/lib/types";
import { IMAGE_MIME_TYPES, TEXT_MIME_TYPES } from "@/lib/validations/chat";

const UPLOAD_URL_EXPIRY = 3600;
const DOWNLOAD_URL_EXPIRY = 7 * 24 * 3600;

export function isImageMimeType(mimeType: string): boolean {
	return IMAGE_MIME_TYPES.has(mimeType);
}

export function isTextMimeType(mimeType: string): boolean {
	return TEXT_MIME_TYPES.has(mimeType);
}

let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
	if (_r2Client) return _r2Client;

	const accountId = process.env.R2_ACCOUNT_ID;
	const accessKeyId = process.env.R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

	if (!accountId || !accessKeyId || !secretAccessKey) {
		throw new Error("R2 environment variables not configured");
	}

	_r2Client = new S3Client({
		region: "auto",
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
		credentials: { accessKeyId, secretAccessKey },
	});
	return _r2Client;
}

function getBucket(): string {
	const bucket = process.env.R2_BUCKET_NAME;
	if (!bucket) throw new Error("R2_BUCKET_NAME not configured");
	return bucket;
}

export async function createPresignedUploadUrl(
	key: string,
	contentType: string,
	contentLength: number,
): Promise<string> {
	const client = getR2Client();
	const command = new PutObjectCommand({
		Bucket: getBucket(),
		Key: key,
		ContentType: contentType,
		ContentLength: contentLength,
	});
	return getSignedUrl(client, command, { expiresIn: UPLOAD_URL_EXPIRY });
}

export async function createPresignedDownloadUrl(key: string): Promise<string> {
	const client = getR2Client();
	const command = new GetObjectCommand({
		Bucket: getBucket(),
		Key: key,
	});
	return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_EXPIRY });
}

export async function regenerateAttachmentUrls(
	attachments: Attachment[],
): Promise<Attachment[]> {
	return Promise.all(
		attachments.map(async (att) => ({
			...att,
			url: await createPresignedDownloadUrl(att.key),
		})),
	);
}

export async function fetchTextContent(key: string): Promise<string> {
	const client = getR2Client();
	const command = new GetObjectCommand({
		Bucket: getBucket(),
		Key: key,
	});
	const response = await client.send(command);
	if (!response.Body) {
		throw new Error(`R2 object not found: ${key}`);
	}
	return response.Body.transformToString("utf-8");
}
