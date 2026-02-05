"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignUpPage() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const data = {
			firstName: formData.get("firstName") as string,
			lastName: formData.get("lastName") as string,
			email,
			phoneNumber: formData.get("phoneNumber") as string,
			password,
		};

		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!res.ok) {
				const json = await res.json();
				if (res.status === 409) {
					setError("An account with this email already exists");
				} else if (json.details?.fieldErrors) {
					const firstError = Object.values(json.details.fieldErrors)[0];
					setError(Array.isArray(firstError) ? firstError[0] : "Invalid input");
				} else {
					setError(json.error || "Something went wrong");
				}
				return;
			}

			await signIn("credentials", {
				email,
				password,
				callbackUrl: "/",
			});
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center">
					<h1 className="font-display text-3xl text-text-primary">
						Create an account
					</h1>
					<p className="mt-2 text-text-secondary">
						Sign up to start using Fortuna
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label
								htmlFor="firstName"
								className="text-sm text-text-secondary"
							>
								First name
							</label>
							<Input
								id="firstName"
								name="firstName"
								type="text"
								autoComplete="given-name"
								required
								placeholder="John"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="lastName" className="text-sm text-text-secondary">
								Last name
							</label>
							<Input
								id="lastName"
								name="lastName"
								type="text"
								autoComplete="family-name"
								required
								placeholder="Doe"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<label htmlFor="email" className="text-sm text-text-secondary">
							Email
						</label>
						<Input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							required
							placeholder="you@example.com"
						/>
					</div>

					<div className="space-y-2">
						<label
							htmlFor="phoneNumber"
							className="text-sm text-text-secondary"
						>
							Phone number
						</label>
						<Input
							id="phoneNumber"
							name="phoneNumber"
							type="tel"
							autoComplete="tel"
							required
							placeholder="+1 (555) 000-0000"
						/>
					</div>

					<div className="space-y-2">
						<label htmlFor="password" className="text-sm text-text-secondary">
							Password
						</label>
						<Input
							id="password"
							name="password"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							placeholder="Minimum 8 characters"
						/>
					</div>

					<Button
						type="submit"
						disabled={loading}
						className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse disabled:opacity-50"
					>
						{loading ? "Creating account..." : "Create account"}
					</Button>
				</form>

				<p className="text-center text-sm text-text-secondary">
					Already have an account?{" "}
					<Link
						href="/auth/signin"
						className="text-accent-primary hover:text-accent-hover transition-colors"
					>
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
