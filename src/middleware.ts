import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { API_KEY_PREFIX } from "@/lib/api-keys";

export function middleware(request: NextRequest) {
	const sessionCookie = getSessionCookie(request);
	const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
	const hasApiKey = request.headers
		.get("authorization")
		?.startsWith(`Bearer ${API_KEY_PREFIX}`);

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
