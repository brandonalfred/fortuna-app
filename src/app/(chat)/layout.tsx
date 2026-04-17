"use client";

import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { InvalidTokenModal } from "@/components/invalid-token-modal";
import { ChatHistory } from "@/components/sidebar/chat-history";
import { TokenGate } from "@/components/token-gate";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { SessionProvider } from "@/lib/auth/session-context";
import { ChatStoreProvider } from "@/providers/chat-store-provider";
import { QueryProvider } from "@/providers/query-provider";

interface ChatLayoutProps {
	children: ReactNode;
}

export default function ChatLayout({ children }: ChatLayoutProps) {
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const { id: currentChatId } = useParams<{ id?: string }>();
	const pathname = usePathname();

	useEffect(() => {
		setIsSidebarOpen(false);
	}, [pathname]);

	return (
		<QueryProvider>
			<SessionProvider>
				<ChatStoreProvider>
					<div className="flex h-dvh flex-col overflow-hidden bg-bg-primary">
						<Header
							isSidebarOpen={isSidebarOpen}
							onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
						/>
						<div className="flex flex-1 overflow-hidden">
							<aside className="hidden w-64 shrink-0 overflow-hidden lg:block">
								<ChatHistory currentChatId={currentChatId} />
							</aside>

							<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
								<SheetContent side="left" className="w-72 p-0 lg:hidden">
									<SheetTitle className="sr-only">Chat history</SheetTitle>
									<SheetDescription className="sr-only">
										Browse and switch between your conversations
									</SheetDescription>
									<ChatHistory currentChatId={currentChatId} />
								</SheetContent>
							</Sheet>

							<main className="flex-1 overflow-hidden">{children}</main>
						</div>
						<TokenGate>
							<InvalidTokenModal />
						</TokenGate>
					</div>
				</ChatStoreProvider>
			</SessionProvider>
		</QueryProvider>
	);
}
