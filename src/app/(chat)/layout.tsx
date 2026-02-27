"use client";

import { X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand";
import { Header } from "@/components/header";
import { ChatHistory } from "@/components/sidebar/chat-history";
import {
	Sheet,
	SheetClose,
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
							<aside className="hidden w-60 shrink-0 overflow-hidden border-r border-border-subtle lg:block">
								<ChatHistory currentChatId={currentChatId} />
							</aside>

							<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
								<SheetContent side="left" className="w-60 p-0 lg:hidden">
									<SheetTitle className="sr-only">Chat history</SheetTitle>
									<SheetDescription className="sr-only">
										Browse and switch between your conversations
									</SheetDescription>
									<div className="flex h-14 items-center justify-between border-b border-border-subtle px-3">
										<BrandLogo className="text-lg" />
										<SheetClose className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary">
											<X className="h-5 w-5" />
											<span className="sr-only">Close</span>
										</SheetClose>
									</div>
									<ChatHistory currentChatId={currentChatId} />
								</SheetContent>
							</Sheet>

							<main className="flex-1 overflow-hidden">{children}</main>
						</div>
					</div>
				</ChatStoreProvider>
			</SessionProvider>
		</QueryProvider>
	);
}
