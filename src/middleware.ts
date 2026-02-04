import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
	const { nextUrl } = req;
	const token = await getToken({ req, secret: process.env.AUTH_SECRET });
	const isLoggedIn = !!token;
	const isAuthPage = nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (isLoggedIn) {
			return NextResponse.redirect(new URL("/", nextUrl));
		}
		return NextResponse.next();
	}

	if (!isLoggedIn) {
		return NextResponse.redirect(new URL("/auth/signin", nextUrl));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
