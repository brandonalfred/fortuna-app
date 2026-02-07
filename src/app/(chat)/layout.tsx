"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { ChatHistory } from "@/components/sidebar/chat-history";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export default function ChatLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const { id: currentChatId } = useParams<{ id?: string }>();
	const pathname = usePathname();

	useEffect(() => {
		setIsSidebarOpen(false);
	}, [pathname]);

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-bg-primary">
			<Header
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
			/>
			<div className="flex flex-1 overflow-hidden">
				<aside className="hidden w-60 shrink-0 border-r border-border-subtle lg:block">
					<ChatHistory currentChatId={currentChatId} />
				</aside>

				<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
					<SheetContent side="left" className="w-60 p-0 lg:hidden">
						<SheetTitle className="sr-only">Chat history</SheetTitle>
						<div className="h-14 border-b border-border-subtle" />
						<ChatHistory currentChatId={currentChatId} />
					</SheetContent>
				</Sheet>

				<main className="flex-1 overflow-hidden">{children}</main>
			</div>
		</div>
	);
}
