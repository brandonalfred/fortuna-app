"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useActiveChat } from "@/hooks/use-chat-actions";

export function InvalidTokenModal() {
	const router = useRouter();
	const { error, errorCode, clearError } = useActiveChat();

	const open = errorCode === "invalid_token" || errorCode === "token_required";

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) clearError();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Claude token issue</DialogTitle>
					<DialogDescription>
						{error ??
							"Your Claude OAuth token is invalid or expired. Update it in your profile to continue."}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						onClick={() => {
							clearError();
							router.push("/settings/profile");
						}}
					>
						Go to Profile
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
