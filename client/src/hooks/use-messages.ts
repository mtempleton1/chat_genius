import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessages(
  messageIdOrChannelId: number | null,
  isThread: boolean = false,
) {
  const queryClient = useQueryClient();
  const queryKey = isThread
    ? [`/api/messages/${messageIdOrChannelId}/thread`]
    : [`/api/channels/${messageIdOrChannelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    enabled: messageIdOrChannelId !== null && messageIdOrChannelId > 0,
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      parentId,
      directMessageId,
    }: {
      content: string;
      parentId?: number;
      directMessageId?: number | null;
    }) => {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          channelId: parentId ? messages?.[0].channelId : messageIdOrChannelId,
          parentId,
          directMessageId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (newMessage) => {
      // Update the thread or channel messages cache
      queryClient.setQueryData<Message[]>(queryKey, (old) => {
        if (!old) return [newMessage];
        return [...old, newMessage];
      });

      // If this is a thread reply, update both channel and DM message counts
      if (newMessage.parentId) {
        if (newMessage.channelId) {
          queryClient.invalidateQueries({
            queryKey: [`/api/channels/${newMessage.channelId}/messages`],
          });
        }
        if (newMessage.directMessageId) {
          queryClient.invalidateQueries({
            queryKey: [`/api/workspaces/${newMessage.workspaceId}/direct-messages/${newMessage.userId}`],
          });
        }
      }
    },
  });

  const addReaction = useMutation({
    mutationFn: async ({
      messageId,
      emoji,
    }: {
      messageId: number;
      emoji: string;
    }) => {
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