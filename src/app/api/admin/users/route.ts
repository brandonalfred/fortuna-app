import type { NextRequest } from "next/server";
import { forbidden, getAdminUser, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const ALLOWED_SORT_FIELDS = [
	"createdAt",
	"email",
	"firstName",
	"lastName",
] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

function insensitiveContains(search: string) {
	return { contains: search, mode: "insensitive" as const };
}

export async function GET(request: NextRequest): Promise<Response> {
	const result = await getAdminUser();
	if (result.status === "unauthenticated") {
		return unauthorized();
	}
	if (result.status === "forbidden") {
		return forbidden();
	}

	const searchParams = request.nextUrl.searchParams;
	const search = searchParams.get("search") ?? "";
	const sortBy = searchParams.get("sortBy") ?? "createdAt";
	const sortDir = searchParams.get("sortDir") ?? "desc";
	const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
	const limit = Math.min(
		Number.parseInt(searchParams.get("limit") ?? "20", 10),
		100,
	);
	const offset = (page - 1) * limit;

	const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy as SortField)
		? sortBy
		: "createdAt";
	const safeSortDir = sortDir === "asc" ? "asc" : "desc";

	const where = search
		? {
				OR: [
					{ email: insensitiveContains(search) },
					{ firstName: insensitiveContains(search) },
					{ lastName: insensitiveContains(search) },
				],
			}
		: {};

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				role: true,
				emailVerified: true,
				createdAt: true,
				_count: {
					select: { chats: true },
				},
				sessions: {
					select: { updatedAt: true },
					orderBy: { updatedAt: "desc" },
					take: 1,
				},
			},
			orderBy: { [safeSortBy]: safeSortDir },
			skip: offset,
			take: limit,
		}),
		prisma.user.count({ where }),
	]);

	const formatted = users.map((user) => ({
		id: user.id,
		email: user.email,
		firstName: user.firstName,
		lastName: user.lastName,
		role: user.role ?? "user",
		emailVerified: user.emailVerified,
		createdAt: user.createdAt,
		totalChats: user._count.chats,
		lastActive: user.sessions[0]?.updatedAt ?? null,
	}));

	return Response.json({
		users: formatted,
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
	});
}
