import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessages(channelId: number | null) {
  const queryClient = useQueryClient();
  const queryKey = [`/api/channels/${channelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    enabled: channelId !== null && channelId > 0,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: number }) => {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content, 
          channelId: parentId ? messages?.[0].channelId : channelId,
          parentId
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