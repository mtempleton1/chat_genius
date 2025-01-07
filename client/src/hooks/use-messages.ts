import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessages(channelId: number | null) {
  const queryClient = useQueryClient();
  const isThread = typeof channelId === "number" && channelId > 0;
  const queryKey = isThread 
    ? [`/api/messages/${channelId}/thread`]
    : [`/api/channels/${channelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    enabled: channelId !== null && channelId > 0,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string, options?: { parentId?: number }) => {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content, 
          channelId: options?.parentId ? messages?.[0].channelId : channelId,
          parentId: options?.parentId
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (old) => {
        if (!old) return [newMessage];
        return [...old, newMessage];
      });
    },
  });

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const response = await fetch(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey,
      });
    },
  });

  return {
    messages,
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    addReaction: addReaction.mutate,
  };
}