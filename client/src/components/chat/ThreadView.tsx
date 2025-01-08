import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMessages } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message } from "@db/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type ThreadViewProps = {
  messageId: number;
  onClose: () => void;
  directMessageId?: number | null;
};

type ThreadMessage = {
  id: number;
  content: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  userId: number | null;
  channelId: number | null;
  directMessageId: number | null;
  parentId: number | null;
  attachments: Array<{ url: string; name: string }> | null;
  user?: {
    id: number;
    username: string;
    avatar?: string | null;
  };
};

export default function ThreadView({ messageId, onClose, directMessageId }: ThreadViewProps) {
  const { messages, isLoading, sendMessage } = useMessages(messageId, true);
  const queryClient = useQueryClient();
  const { addMessageHandler, sendMessage: sendWebSocketMessage } = useWebSocket();
  const handlerRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  // Set up WebSocket message handler for thread updates
  useEffect(() => {
    if (handlerRef.current) {
      handlerRef.current();
      handlerRef.current = null;
    }

    const cleanup = addMessageHandler((msg) => {
      if (msg.type === "thread_message" && msg.parentId === messageId) {
        queryClient.setQueryData<ThreadMessage[]>(
          [`/api/messages/${messageId}/thread`],
          (oldMessages = []) => {
            const newMessage: ThreadMessage = {
              id: msg.messageId,
              content: msg.content,
              userId: msg.userId,
              channelId: msg.channelId,
              directMessageId: msg.directMessageId,
              parentId: msg.parentId,
              createdAt: msg.createdAt || new Date(),
              updatedAt: msg.createdAt || new Date(),
              attachments: msg.attachments || null,
              user: msg.user
            };

            if (!oldMessages?.some((m) => m.id === newMessage.id)) {
              return [...oldMessages, newMessage].sort(
                (a, b) =>
                  new Date(a.createdAt!).getTime() -
                  new Date(b.createdAt!).getTime(),
              );
            }

            return oldMessages;
          },
        );

        // Update reply count in parent message list
        const queryKey = directMessageId
          ? [`/api/workspaces/${msg.channelId}/direct-messages/${directMessageId}`]
          : [`/api/channels/${msg.channelId}/messages`];

        queryClient.setQueryData<any[]>(queryKey, (oldData) => {
          if (!oldData) return oldData;
          return oldData.map((item) => {
            if (item.message?.id === messageId || item.id === messageId) {
              const currentReplyCount = (item.message?.replyCount || item.replyCount || 0) + 1;
              return item.message
                ? { ...item, message: { ...item.message, replyCount: currentReplyCount } }
                : { ...item, replyCount: currentReplyCount };
            }
            return item;
          });
        });
      }
    }, `thread-${messageId}`);

    handlerRef.current = cleanup;

    return () => {
      if (handlerRef.current) {
        handlerRef.current();
        handlerRef.current = null;
      }
    };
  }, [messageId, queryClient, addMessageHandler, directMessageId]);

  const handleSendMessage = async (content: string) => {
    if (!messageId || !content.trim()) return;

    try {
      const newMessage = await sendMessage({
        content,
        parentId: messageId,
        directMessageId,
      });

      sendWebSocketMessage({
        type: "thread_message",
        channelId: newMessage.channelId,
        directMessageId: newMessage.directMessageId,
        messageId: newMessage.id,
        parentId: messageId,
        content: newMessage.content,
        userId: newMessage.userId,
        user: newMessage.user,
        attachments: newMessage.attachments,
        createdAt: newMessage.createdAt,
      });
    } catch (error) {
      console.error("Error sending thread message:", error);
    }
  };

  if (!messageId) return null;

  if (isLoading) {
    return (
      <div className="h-full flex flex-col border-l">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Thread</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading thread...
        </div>
      </div>
    );
  }

  const parentMessage = messages?.[0];
  if (!parentMessage) {
    return (
      <div className="h-full flex flex-col border-l">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Thread</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Thread not found
        </div>
      </div>
    );
  }

  const replies = messages?.slice(1) || [];

  return (
    <div className="h-full flex flex-col border-l">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          <ThreadMessage message={parentMessage} isParent />
          {replies.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={handleSendMessage}
          fileUploadComponent={
            <FileUpload
              channelId={parentMessage.channelId || 0}
              directMessageId={directMessageId}
            />
          }
        />
      </div>
    </div>
  );
}

function ThreadMessage({ message, isParent }: { message: ThreadMessage; isParent?: boolean }) {
  if (!message.user) return null;

  return (
    <div className={`p-4 ${isParent ? "bg-accent rounded-lg" : ""}`}>
      <div className="flex items-center gap-2">
        <Avatar>
          <AvatarImage src={message.user.avatar || undefined} alt={message.user.username} />
          <AvatarFallback>{message.user.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <span className="font-semibold">{message.user.username}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {new Date(message.createdAt!).toLocaleString()}
          </span>
        </div>
      </div>
      <p className="mt-2">{message.content}</p>
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-2 flex gap-2">
          {message.attachments.map((attachment, index) => (
            <a
              key={index}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-500 hover:underline"
            >
              {attachment.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}