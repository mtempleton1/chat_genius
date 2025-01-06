import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile } from "lucide-react";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message, User } from "@db/schema";

type MessageListProps = {
  channelId: number | null;
  onThreadSelect: (messageId: number) => void;
};

type MessageWithUser = Message & {
  user: User;
  reactions: Array<{
    id: number;
    emoji: string;
    userId: number;
    user: User;
  }>;
};

export default function MessageList({ channelId, onThreadSelect }: MessageListProps) {
  const { messages, isLoading, sendMessage, addReaction } = useMessages(channelId ?? 0);
  const { addMessageHandler, sendMessage: sendWebSocketMessage } = useWebSocket();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!channelId) return;

    return addMessageHandler((msg) => {
      if (msg.type === "message" && msg.channelId === channelId) {
        // The message will be added through the React Query cache invalidation
      }
    });
  }, [addMessageHandler, channelId]);

  const handleSendMessage = async (content: string) => {
    if (!channelId) return;

    await sendMessage(content);
    sendWebSocketMessage({
      type: "message",
      channelId,
      content,
    });
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
      <div className="h-full flex items-center justify-center">
        Loading messages...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages?.map((message) => (
            <MessageItem
              key={message.id}
              message={message as MessageWithUser}
              onThreadSelect={onThreadSelect}
              onReactionAdd={(emoji) => addReaction({ messageId: message.id, emoji })}
            />
          ))}
        </div>
      </ScrollArea>

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
  message: MessageWithUser;
  onThreadSelect: (messageId: number) => void;
  onReactionAdd: (emoji: string) => void;
};

function MessageItem({ message, onThreadSelect, onReactionAdd }: MessageItemProps) {
  return (
    <div className="flex gap-3 group">
      <Avatar>
        <AvatarImage src={message.user.avatar ?? undefined} alt={message.user.username} />
        <AvatarFallback>{message.user.username[0].toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{message.user.username}</span>
          <span className="text-xs text-muted-foreground">
            {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : ""}
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
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Reply
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReactionAdd("👍")}
          >
            <Smile className="h-4 w-4 mr-1" />
            React
          </Button>
        </div>
      </div>
    </div>
  );
}