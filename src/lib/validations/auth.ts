export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const UPPERCASE_REGEX = /[A-Z]/;
const NUMBER_REGEX = /[0-9]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export const passwordRequirements = [
	{
		label: "Minimum 8 characters",
		test: (pw: string) => pw.length >= PASSWORD_MIN_LENGTH,
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
