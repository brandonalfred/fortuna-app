import bcrypt from "bcrypt";
import { badRequest, conflict, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";

const BCRYPT_ROUNDS = 12;

export async function POST(req: Request): Promise<Response> {
	try {
		const body = await req.json();
		const parsed = registerSchema.safeParse(body);

		if (!parsed.success) {
			return badRequest("Invalid request", parsed.error.flatten());
		}

		const { firstName, lastName, email, phoneNumber, password } = parsed.data;

		const existingUser = await prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			return conflict("An account with this email already exists");
		}

		const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

		const user = await prisma.user.create({
			data: {
				firstName,
				lastName,
				email,
				phoneNumber,
				passwordHash,
			},
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
			},
		});

		return Response.json(user, { status: 201 });
	} catch (error) {
		console.error("Registration error:", error);
		return serverError(error);
	}
}
