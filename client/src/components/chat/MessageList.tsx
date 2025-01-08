import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message } from "@db/schema";

type MessageListProps = {
  channelId: number | null;
  channelName?: string;
  onThreadSelect: (messageId: number) => void;
};

type ChannelMessage = {
  id: number;
  content: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  userId: number | null;
  channelId: number | null;
  directMessageId: number | null;
  parentId: number | null;
  replyCount: number;
  attachments: Array<{ url: string; name: string }> | null;
  user: {
    id: number;
    username: string;
    avatar?: string | null;
  };
};

export default function MessageList({
  channelId,
  channelName,
  onThreadSelect,
}: MessageListProps) {
  const { messages, isLoading, sendMessage, addReaction } = useMessages(
    channelId ?? 0,
  );
  console.log("HERE");
  console.log(messages);
  const { addMessageHandler, sendMessage: sendWebSocketMessage } =
    useWebSocket();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const cleanupRef = useRef<(() => void) | null>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  // Set up WebSocket message handler
  useEffect(() => {
    if (!channelId) return;

    if (!cleanupRef.current) {
      const cleanup = addMessageHandler((msg) => {
        if (msg.type === "message" && msg.channelId === channelId) {
          const newMessage = msg.newMessage as ChannelMessage;
          if (!newMessage) return;

          queryClient.setQueryData<ChannelMessage[]>(
            [`/api/channels/${channelId}/messages`],
            (oldMessages = []) => {
              if (!oldMessages) return [newMessage];

              // Only add top-level messages
              if (!newMessage.parentId) {
                return [...oldMessages, { ...newMessage, replyCount: 0 }].sort(
                  (a, b) =>
                    new Date(a.createdAt!).getTime() -
                    new Date(b.createdAt!).getTime(),
                );
              }

              // Update reply count for parent message
              return oldMessages.map((msg) => {
                if (msg.id === newMessage.parentId) {
                  return { ...msg, replyCount: (msg.replyCount || 0) + 1 };
                }
                return msg;
              });
            },
          );
        }
      }, `channel-${channelId}`);

      cleanupRef.current = cleanup;
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [channelId, queryClient, addMessageHandler]);

  const handleSendMessage = async (content: string) => {
    if (!channelId || !content.trim()) return;

    try {
      const newMessage = await sendMessage({ content });
      sendWebSocketMessage({
        type: "message",
        channelId,
        newMessage,
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  if (!channelId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a channel to start chatting
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading messages...
      </div>
    );
  }

  // Filter out thread replies from the main channel view
  const channelMessages =
    (messages as ChannelMessage[])?.filter((msg) => !msg.parentId) || [];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2">
        <h2 className="font-semibold"># {channelName || "Channel Messages"}</h2>
      </div>

      <div className="flex-1 overflow-hidden" ref={scrollRef}>
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {channelMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onThreadSelect={onThreadSelect}
                onReactionAdd={(emoji) =>
                  addReaction({ messageId: message.id, emoji })
                }
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={handleSendMessage}
          fileUploadComponent={<FileUpload channelId={channelId} />}
        />
      </div>
    </div>
  );
}

type MessageItemProps = {
  message: ChannelMessage;
  onThreadSelect: (messageId: number) => void;
  onReactionAdd: (emoji: string) => void;
};

function MessageItem({
  message,
  onThreadSelect,
  onReactionAdd,
}: MessageItemProps) {
  if (!message.user) return null;

  return (
    <div className="flex gap-3 group">
      <Avatar>
        <AvatarImage
          src={message.user.avatar || undefined}
          alt={message.user.username}
        />
        <AvatarFallback>
          {message.user.username[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{message.user.username}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.createdAt!).toLocaleTimeString()}
          </span>
        </div>

        <p className="mt-1">{message.content}</p>

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex gap-2">
            {message.attachments.map((attachment, i) => (
              <a
                key={i}
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

        <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onThreadSelect(message.id)}
            className="flex items-center gap-1"
          >
            <MessageSquare className="h-4 w-4" />
            Reply {message.replyCount > 0 && `(${message.replyCount})`}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => onReactionAdd("👍")}>
            <Smile className="h-4 w-4 mr-1" />
            React
          </Button>
        </div>
      </div>
    </div>
  );
}
