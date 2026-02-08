import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hydrateMessageSegments } from "@/lib/segments";
import type { Chat } from "@/lib/types";

export function useChatQuery(chatId: string | undefined, isStreaming: boolean) {
	return useQuery({
		queryKey: ["chat", chatId],
		queryFn: async (): Promise<Chat> => {
			const res = await fetch(`/api/chats/${chatId}`);
			if (!res.ok) throw new Error("Chat not found");
			const chat: Chat = await res.json();
			chat.messages = (chat.messages || []).map(hydrateMessageSegments);
			return chat;
		},
		enabled: !!chatId && !isStreaming,
		refetchOnWindowFocus: () => !isStreaming,
	});
}

export function useInvalidateChat() {
	const queryClient = useQueryClient();
	return (chatId: string) => {
		queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
	};
}
