"use client";

import { useCallback, useState } from "react";
import { ChatWindow } from "@/components/chat/chat-window";
import { Header } from "@/components/header";
import { ChatHistory } from "@/components/sidebar/chat-history";
import { cn } from "@/lib/utils";

export default function Home() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [currentChatId, setCurrentChatId] = useState<string | undefined>();

	const handleToggleSidebar = useCallback(() => {
		setIsSidebarOpen((prev) => !prev);
	}, []);

	const handleNewChat = useCallback(() => {
		setCurrentChatId(undefined);
		setIsSidebarOpen(false);
	}, []);

	const handleSelectChat = useCallback((chatId: string) => {
		setCurrentChatId(chatId);
		setIsSidebarOpen(false);
	}, []);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-bg-primary">
			<Header
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={handleToggleSidebar}
				onNewChat={handleNewChat}
			/>
			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar - desktop */}
				<aside className="hidden w-60 shrink-0 border-r border-border-subtle lg:block">
					<ChatHistory
						currentChatId={currentChatId}
						onSelectChat={handleSelectChat}
						onNewChat={handleNewChat}
					/>
				</aside>

				{/* Sidebar - mobile overlay */}
				{isSidebarOpen && (
					<>
						<button
							type="button"
							aria-label="Close sidebar"
							className="fixed inset-0 z-40 bg-black/50 lg:hidden cursor-default"
							onClick={() => setIsSidebarOpen(false)}
							onKeyDown={(e) => e.key === "Escape" && setIsSidebarOpen(false)}
						/>
						<aside
							className={cn(
								"fixed inset-y-0 left-0 z-50 w-60 border-r border-border-subtle lg:hidden",
								"transform transition-transform duration-200 ease-out",
								isSidebarOpen ? "translate-x-0" : "-translate-x-full",
							)}
						>
							<div className="h-14 border-b border-border-subtle" />
							<ChatHistory
								currentChatId={currentChatId}
								onSelectChat={handleSelectChat}
								onNewChat={handleNewChat}
							/>
						</aside>
					</>
				)}

				{/* Main chat area */}
				<main className="flex-1 overflow-hidden">
					<ChatWindow />
				</main>
			</div>
		</div>
	);
}
