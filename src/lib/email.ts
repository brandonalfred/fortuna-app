import { Resend } from "resend";

const fromAddress =
	process.env.RESEND_FROM_EMAIL ?? "FortunaBets <noreply@fortunabets.ai>";

let resendClient: Resend | null = null;
function getResend() {
	resendClient ??= new Resend(process.env.RESEND_API_KEY);
	return resendClient;
}

export async function sendOTPEmail(to: string, otp: string) {
	if (!process.env.RESEND_API_KEY) {
		console.log(`[2FA] Email OTP for ${to}: ${otp}`);
		return;
	}

	const resend = getResend();
	await resend.emails.send({
		from: fromAddress,
		to,
		subject: `${otp} is your FortunaBets verification code`,
		html: `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
				<h2 style="color: #f0f0f2; font-size: 20px; margin-bottom: 8px;">Verification Code</h2>
				<p style="color: #a0a0a6; font-size: 14px; margin-bottom: 24px;">
					Enter this code to complete your sign-in:
				</p>
				<div style="background: #1c1c1f; border: 1px solid #2a2a2e; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
					<span style="font-size: 32px; font-weight: 600; letter-spacing: 6px; color: #4a9e9e;">${otp}</span>
				</div>
				<p style="color: #6a6a70; font-size: 12px;">
					This code expires in 3 minutes. If you didn't request this, you can safely ignore this email.
				</p>
			</div>
		`,
	});
}
