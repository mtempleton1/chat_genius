import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import type { Message } from "@db/schema";

type ThreadViewProps = {
  messageId: number;
  onClose: () => void;
};

export default function ThreadView({ messageId, onClose }: ThreadViewProps) {
  const { messages, sendMessage } = useMessages(messageId);

  const parentMessage = messages?.[0];
  if (!parentMessage) return null;

  const replies = messages?.filter((m) => m.id !== messageId);

  return (
    <div className="h-full flex flex-col border-l">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <ThreadMessage message={parentMessage} isParent />
          {replies?.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={(content) =>
            sendMessage(content)
          }
          fileUploadComponent={<FileUpload channelId={parentMessage.channelId} />}
        />
      </div>
    </div>
  );
}

type ThreadMessageProps = {
  message: Message;
  isParent?: boolean;
};

function ThreadMessage({ message, isParent }: ThreadMessageProps) {
  return (
    <div className={`p-4 ${isParent ? "bg-accent rounded-lg" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{message.user?.username}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-1">{message.content}</p>
      {message.attachments?.length > 0 && (
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
    </div>
  );
}
