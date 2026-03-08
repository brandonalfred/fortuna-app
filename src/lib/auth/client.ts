import {
	adminClient,
	inferAdditionalFields,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./index";

export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields<typeof auth>(),
		adminClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				window.location.href = "/auth/verify-2fa";
			},
		}),
	],
});

export const { signIn, signUp, signOut, useSession } = authClient;
