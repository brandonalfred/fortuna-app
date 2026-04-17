// ESM-only and dependency-free so it can be shipped into the sandbox verbatim.

const STATUS_CODE = /\b(401|403)\b/;
const KEYWORDS = [
	"invalid_api_key",
	"invalid api key",
	"authentication_error",
	"oauth token",
	"unauthorized",
];

export const INVALID_TOKEN_MESSAGE =
	"Your Claude OAuth token was rejected. Update it in Settings → Profile.";

export function detectAuthError(error) {
	if (!error) return false;
	const status =
		error?.statusCode ?? error?.status ?? error?.response?.status ?? null;
	if (status === 401 || status === 403) return true;

	const raw = error instanceof Error ? error.message : String(error);
	const msg = raw.toLowerCase();
	if (STATUS_CODE.test(msg)) return true;
	return KEYWORDS.some((kw) => msg.includes(kw));
}
