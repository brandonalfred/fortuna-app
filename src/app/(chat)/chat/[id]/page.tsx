"use client";

import { useParams } from "next/navigation";
import { ChatWindow } from "@/components/chat/chat-window";

export default function ChatPage() {
	const { id } = useParams();
	return <ChatWindow chatId={id as string} />;
}
