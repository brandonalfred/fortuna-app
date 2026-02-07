"use client";

import { createContext, use } from "react";
import type { Session } from "@/lib/auth";
import { useSession } from "@/lib/auth/client";

interface SessionContextValue {
	session: Session | null;
	isPending: boolean;
}

const SessionContext = createContext<SessionContextValue>({
	session: null,
	isPending: true,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = useSession();

	return (
		<SessionContext value={{ session, isPending }}>{children}</SessionContext>
	);
}

export function useSessionContext() {
	return use(SessionContext);
}
