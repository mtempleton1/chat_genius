import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import MessageInput from "./MessageInput";
import { useDirectMessages } from "@/hooks/use-direct-messages";
import { useUser } from "@/hooks/use-user";
import FileUpload from "./FileUpload";
import { Loader2 } from "lucide-react";

type DirectMessageChatProps = {
  userId: number;
  username: string;
  workspaceId: number;
};

export default function DirectMessageChat({ userId, username, workspaceId }: DirectMessageChatProps) {
  const { messages, isLoading, sendMessage } = useDirectMessages(workspaceId, userId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage(content);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2 flex items-center space-x-2">
        <Avatar className="h-6 w-6">
          <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs uppercase">
            {username[0]}
          </div>
        </Avatar>
        <span className="font-medium">{username}</span>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex gap-2">
                <Avatar className="h-8 w-8">
                  <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs uppercase">
                    {message.user.username[0]}
                  </div>
                </Avatar>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{message.user.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.createdAt!).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1">{message.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={handleSendMessage}
          fileUploadComponent={<FileUpload channelId={0} />}
        />
      </div>
    </div>
  );
}