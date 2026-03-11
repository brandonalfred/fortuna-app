import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Duplicates API_KEY_PREFIX ("ftn_") from api-keys.ts — can't import it here
// because that module pulls in node:crypto and prisma, unavailable at the Edge.
const API_KEY_HEADER_RE = /^bearer\s+ftn_/i;

export function middleware(request: NextRequest) {
	const sessionCookie = getSessionCookie(request);
	const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
	const hasApiKey = API_KEY_HEADER_RE.test(
		request.headers.get("authorization") ?? "",
	);

	if (request.nextUrl.pathname === "/") {
		if (sessionCookie) {
			return NextResponse.redirect(new URL("/new", request.url));
		}
		return NextResponse.next();
	}
	const isAuthPage = request.nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (sessionCookie) {
			return NextResponse.redirect(new URL("/new", request.url));
		}
		return NextResponse.next();
	}

	if (!sessionCookie && !(isApiRoute && hasApiKey)) {
		return NextResponse.redirect(new URL("/auth/signin", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api/auth|api/chat/persist|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
	],
};
