import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const UPPERCASE_REGEX = /[A-Z]/;
const NUMBER_REGEX = /[0-9]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export const passwordRequirements = [
	{
		label: "8–128 characters",
		test: (pw: string) =>
			pw.length >= PASSWORD_MIN_LENGTH && pw.length <= PASSWORD_MAX_LENGTH,
	},
	{
		label: "At least 1 uppercase letter",
		test: (pw: string) => UPPERCASE_REGEX.test(pw),
	},
	{
		label: "At least 1 number",
		test: (pw: string) => NUMBER_REGEX.test(pw),
	},
	{
		label: "At least 1 special character",
		test: (pw: string) => SPECIAL_CHAR_REGEX.test(pw),
	},
] as const;

export const signInSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
	firstName: z.string().min(1, "First name is required").max(100),
	lastName: z.string().min(1, "Last name is required").max(100),
	email: z.string().email("Invalid email address"),
	phoneNumber: z.string().regex(/^\d{10}$/, "Phone number must be 10 digits"),
	password: z
		.string()
		.min(PASSWORD_MIN_LENGTH, "Password must be at least 8 characters")
		.max(PASSWORD_MAX_LENGTH, "Password must be at most 128 characters")
		.regex(UPPERCASE_REGEX, "Must contain an uppercase letter")
		.regex(NUMBER_REGEX, "Must contain a number")
		.regex(SPECIAL_CHAR_REGEX, "Must contain a special character"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
