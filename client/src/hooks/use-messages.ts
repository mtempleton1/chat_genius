import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessages(channelId: number) {
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
    enabled: channelId > 0,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, channelId }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (newMessage) => {
      // Optimistically update the messages cache
      queryClient.setQueryData<Message[]>([`/api/channels/${channelId}/messages`], (old) => {
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
        queryKey: [`/api/channels/${channelId}/messages`],
      });
    },
  });

  return {
    messages,
    isLoading,
    sendMessage: sendMessage.mutate,
    addReaction: addReaction.mutate,
  };
}