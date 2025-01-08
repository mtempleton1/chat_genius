import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMessages } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message, User, Reaction } from "@db/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ConsoleLogWriter } from "drizzle-orm";

type ThreadViewProps = {
  messageId: number;
  onClose: () => void;
};

type ThreadMessage = Message & {
  user?: User;
  reactions?: Reaction[];
  attachments?: Array<{ url: string; name: string }> | null;
};

export default function ThreadView({ messageId, onClose }: ThreadViewProps) {
  const { messages, isLoading, sendMessage } = useMessages(messageId, true);
  const queryClient = useQueryClient(); 
  const { addMessageHandler, sendMessage: sendWebSocketMessage } = useWebSocket();
  const handlerRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    console.log(`Setting up thread message handler for messageId: ${messageId}`);

    if (handlerRef.current) {
      handlerRef.current();
      handlerRef.current = null;
    }

    const cleanup = addMessageHandler((msg) => {
      try {
        // Only handle thread messages for this specific thread
        if (msg.type === "thread_message" && msg.parentId === messageId) {
          console.log("ThreadView received thread message:", msg);

          queryClient.setQueryData<ThreadMessage[]>(
            [`/api/messages/${messageId}/thread`],
            (oldMessages = []) => {
              const newMessage: ThreadMessage = {
                id: msg.messageId,
                content: msg.content,
                userId: msg.userId,
                channelId: msg.channelId,
                parentId: msg.parentId,
                createdAt: msg.createdAt || new Date(),
                updatedAt: msg.createdAt || new Date(),
                user: msg.user,
                reactions: [],
                attachments: msg.attachments || null,
                directMessageId: null
              };

              console.log("Updating thread messages:", {
                oldMessages,
                newMessage,
              });

              // Check if message already exists
              if (oldMessages?.some((m) => m.id === newMessage.id)) {
                return oldMessages;
              }

              // Add new message and sort by creation time
              return [...(oldMessages || []), newMessage].sort(
                (a, b) =>
                  new Date(a.createdAt!).getTime() -
                  new Date(b.createdAt!).getTime(),
              );
            },
          );
        }
      } catch (error) {
        console.error("Error handling thread message:", error);
      }
    }, `thread-${messageId}`);

    handlerRef.current = cleanup;

    return () => {
      if (handlerRef.current) {
        console.log("Cleaning up thread message handler for messageId:", messageId);
        handlerRef.current();
        handlerRef.current = null;
      }
    };
  }, [messageId, queryClient, addMessageHandler]);

  const handleSendMessage = async (content: string) => {
    if (!messageId) return;

    try {
      const newMessage = await sendMessage({ content, parentId: messageId });
      console.log("Sending thread message:", newMessage);

      // Send both thread_message and regular message updates
      // thread_message for thread view updates
      sendWebSocketMessage({
        type: "thread_message",
        channelId: newMessage.channelId,
        messageId: newMessage.id,
        parentId: messageId,
        content: newMessage.content,
        userId: newMessage.userId,
        user: newMessage.user,
        attachments: newMessage.attachments,
        createdAt: newMessage.createdAt,
      });

      // message for channel view thread count updates
      sendWebSocketMessage({
        type: "message",
        channelId: newMessage.channelId,
        newMessage,
      });
    } catch (error) {
      console.error("Error sending thread message:", error);
    }
  };

  if (!messageId) {
    return null;
  }

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

  const parentMessage = messages?.[0] as ThreadMessage;
  console.log("Parent message");
  console.log(parentMessage);
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

  const replies = messages?.slice(1) as ThreadMessage[];

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
          {replies?.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={handleSendMessage}
          fileUploadComponent={<FileUpload channelId={parentMessage.channelId!} />}
        />
      </div>
    </div>
  );
}

type ThreadMessageProps = {
  message: ThreadMessage;
  isParent?: boolean;
};

function ThreadMessage({ message, isParent }: ThreadMessageProps) {
  if (!message.user) return null;
  console.log("thread view")
  console.log(message);
  console.log(message.user);
  console.log(message.createdAt);
  console.log(message.content);
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