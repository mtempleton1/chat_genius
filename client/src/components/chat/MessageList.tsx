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

type ChannelMessage = Message & {
  user?: {
    id: number;
    username: string;
    avatar?: string | null;
  };
  attachments?: Array<{ url: string; name: string }> | null;
  parentId?: number | null;
  replyCount?: number;
};

export default function MessageList({
  channelId,
  channelName,
  onThreadSelect,
}: MessageListProps) {
  const { messages, isLoading, sendMessage, addReaction } = useMessages(
    channelId ?? 0,
  );
  const { addMessageHandler, sendMessage: sendWebSocketMessage } = useWebSocket();
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

  // Set up channel message handler
  useEffect(() => {
    if (!channelId) return;

    console.log(`Setting up channel message handler for channel ${channelId}`);

    if (!cleanupRef.current) {
      const cleanup = addMessageHandler((msg) => {
        try {
          if (msg.type === "message" && msg.channelId === channelId) {
            console.log("MessageList received channel message:", msg);

            const newMessage = msg.newMessage as ChannelMessage;
            if (!newMessage) {
              console.log("No message data in WebSocket message");
              return;
            }

            queryClient.setQueryData<ChannelMessage[]>(
              [`/api/channels/${channelId}/messages`],
              (oldMessages = []) => {
                if (!oldMessages) return [newMessage];

                // Check if message already exists
                const messageExists = oldMessages.some(
                  (m) => m.id === newMessage.id,
                );
                if (messageExists) {
                  return oldMessages.map((m) =>
                    m.id === newMessage.id ? { ...m, ...newMessage } : m,
                  );
                }

                // Only add message if it's not a thread reply
                if (!newMessage.parentId) {
                  const updatedMessages = [...oldMessages, newMessage];
                  return updatedMessages.sort(
                    (a, b) =>
                      new Date(a.createdAt!).getTime() -
                      new Date(b.createdAt!).getTime(),
                  );
                }

                return oldMessages;
              },
            );
          }
        } catch (error) {
          console.error("Error handling channel message:", error);
        }
      }, `channel-${channelId}`);

      cleanupRef.current = cleanup;
    }

    return () => {
      if (cleanupRef.current) {
        console.log(`Cleaning up channel message handler for channel ${channelId}`);
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [channelId, queryClient, addMessageHandler]);

  const handleSendMessage = async (content: string) => {
    if (!channelId) return;

    try {
      const newMessage = await sendMessage({ content });
      console.log("Sending channel message:", newMessage);

      sendWebSocketMessage({
        type: "message",
        channelId,
        newMessage,
      });
    } catch (error) {
      console.error("Error sending channel message:", error);
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
  const channelMessages = messages?.filter((msg) => !msg.parentId) || [];

  // Calculate reply counts for each top-level message
  const replyCountMap: Record<number, number> = {};
  messages?.forEach((msg) => {
    if (msg.parentId) {
      replyCountMap[msg.parentId] = (replyCountMap[msg.parentId] || 0) + 1;
    }
  });

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
                message={message as ChannelMessage}
                onThreadSelect={onThreadSelect}
                onReactionAdd={(emoji) =>
                  addReaction({ messageId: message.id, emoji })
                }
                replyCount={replyCountMap[message.id] || 0}
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
  replyCount: number;
};

function MessageItem({
  message,
  onThreadSelect,
  onReactionAdd,
  replyCount,
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onThreadSelect(message.id);
            }}
            className="flex items-center gap-1"
          >
            <MessageSquare className="h-4 w-4" />
            Reply
            {replyCount > 0 && (
              <span className="ml-1 text-xs bg-secondary px-1.5 py-0.5 rounded-full">
                {replyCount}
              </span>
            )}
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