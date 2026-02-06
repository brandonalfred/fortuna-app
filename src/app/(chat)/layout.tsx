"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { ChatHistory } from "@/components/sidebar/chat-history";

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
		<div className="flex h-screen flex-col overflow-hidden bg-bg-primary">
			<Header
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
			/>
			<div className="flex flex-1 overflow-hidden">
				<aside className="hidden w-60 shrink-0 border-r border-border-subtle lg:block">
					<ChatHistory currentChatId={currentChatId} />
				</aside>

				{isSidebarOpen && (
					<>
						<button
							type="button"
							aria-label="Close sidebar"
							className="fixed inset-0 z-40 bg-black/50 lg:hidden cursor-default"
							onClick={() => setIsSidebarOpen(false)}
						/>
						<aside className="fixed inset-y-0 left-0 z-50 w-60 translate-x-0 border-r border-border-subtle transition-transform duration-200 ease-out lg:hidden">
							<div className="h-14 border-b border-border-subtle" />
							<ChatHistory currentChatId={currentChatId} />
						</aside>
					</>
				)}

				<main className="flex-1 overflow-hidden">{children}</main>
			</div>
		</div>
	);
}
