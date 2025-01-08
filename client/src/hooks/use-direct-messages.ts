import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message, User } from "@db/schema";

type DirectMessageResponse = {
  message: Message;
  user: User;
};

export function useDirectMessages(workspaceId: number, userId: number) {
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery<DirectMessageResponse[]>({
    queryKey: [`/api/workspaces/${workspaceId}/direct-messages/${userId}`],
    enabled: !!workspaceId && !!userId,
  });

  const sendMessage = useMutation({
    mutationFn: async (data: { content: string; parentId?: number }) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/direct-messages/${userId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspaces/${workspaceId}/direct-messages/${userId}`],
      });
    },
  });

  return {
    messages: messages || [],
    isLoading,
    sendMessage: (content: string, parentId?: number) =>
      sendMessage.mutateAsync({ content, parentId }),
  };
}