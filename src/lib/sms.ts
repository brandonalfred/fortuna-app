import type { Twilio } from "twilio";
import twilio from "twilio";

let twilioClient: Twilio | null = null;
function getTwilio() {
	twilioClient ??= twilio(
		process.env.TWILIO_ACCOUNT_SID,
		process.env.TWILIO_AUTH_TOKEN,
	);
	return twilioClient;
}

function normalizePhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
	return phone.startsWith("+") ? phone : `+${digits}`;
}

export async function sendOTPSMS(to: string, otp: string) {
	const phone = normalizePhone(to);

	if (
		!process.env.TWILIO_ACCOUNT_SID ||
		!process.env.TWILIO_VERIFY_SERVICE_SID
	) {
		console.log(`[2FA] SMS OTP for ${phone}: ${otp}`);
		return;
	}

	const client = getTwilio();
	await client.verify.v2
		.services(process.env.TWILIO_VERIFY_SERVICE_SID)
		.verifications.create({
			to: phone,
			channel: "sms",
			customCode: otp,
		});
}
