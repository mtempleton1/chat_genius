import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMessages } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message, User } from "@db/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type ThreadViewProps = {
  messageId: number;
  onClose: () => void;
};

export default function ThreadView({ messageId, onClose }: ThreadViewProps) {
  const { messages, isLoading, sendMessage } = useMessages(messageId, true);
  const { addMessageHandler } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    return addMessageHandler((msg) => {
      if ((msg.type === "message" || msg.type === "thread_message") && msg.parentId === messageId) {
        queryClient.setQueryData<Message[]>(
          [`/api/messages/${messageId}/thread`],
          (oldMessages) => {
            if (!oldMessages) return [msg];
            return [...oldMessages, {
              id: msg.id || msg.messageId,
              content: msg.content,
              userId: msg.userId,
              channelId: msg.channelId,
              parentId: msg.parentId,
              createdAt: new Date().toISOString(),
              user: msg.user,
              reactions: []
            }];
          }
        );
      }
    });
  }, [addMessageHandler, messageId, queryClient]);

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
  if (!parentMessage) return null;

  const replies = messages?.slice(1);

  return (
    <div className="h-full flex flex-col border-l">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <ThreadMessage message={parentMessage} isParent />
          {replies?.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={(content) => sendMessage({ content, parentId: messageId })}
          fileUploadComponent={<FileUpload channelId={parentMessage.channelId!} />}
        />
      </div>
    </div>
  );
}

type ThreadMessageProps = {
  message: Message & {
    user?: User;
    attachments?: Array<{ url: string; name: string }>;
  };
  isParent?: boolean;
};

function ThreadMessage({ message, isParent }: ThreadMessageProps) {
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