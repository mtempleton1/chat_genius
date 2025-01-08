import { Loader2, MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import MessageInput from "./MessageInput";
import { useDirectMessages } from "@/hooks/use-direct-messages";
import { useUser } from "@/hooks/use-user";
import FileUpload from "./FileUpload";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@db/schema";

type DirectMessageChatProps = {
  userId: number;
  username: string;
  workspaceId: number;
  messages: Array<{
    message: Message & {
      directMessageId?: number | null;
    };
    user: {
      id: number;
      username: string;
      avatar?: string | null;
    };
  }>;
  onThreadSelect: (messageId: number) => void;
};

export default function DirectMessageChat({
  userId,
  username,
  workspaceId,
  messages,
  onThreadSelect,
}: DirectMessageChatProps) {
  const { isLoading, sendMessage } = useDirectMessages(
    workspaceId,
    userId,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const shouldScrollRef = useRef(true);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && shouldScrollRef.current) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  // Handle scroll events to determine if we should auto-scroll
  const handleScroll = () => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      // If we're within 100px of the bottom, enable auto-scroll
      shouldScrollRef.current = scrollHeight - (scrollTop + clientHeight) < 100;
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    try {
      await sendMessage(content);
      // Enable auto-scroll when sending a new message
      shouldScrollRef.current = true;
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive",
      });
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

      <ScrollArea
        className="flex-1"
        ref={scrollRef}
        onScrollCapture={handleScroll}
      >
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
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.message.id}
                  className={`flex gap-2 group ${
                    msg.message.userId === currentUser?.id
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  {msg.message.userId !== currentUser?.id && (
                    <Avatar className="h-8 w-8">
                      <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs uppercase">
                        {msg.user.username[0]}
                      </div>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[70%] ${
                      msg.message.userId === currentUser?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary"
                    } rounded-lg p-3`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">
                        {msg.user.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.message.createdAt!).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1">{msg.message.content}</p>
                    <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onThreadSelect(msg.message.id)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Thread {msg.message.replyCount > 0 && `(${msg.message.replyCount})`}
                      </button>
                    </div>
                    {msg.message.attachments && msg.message.attachments.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {msg.message.attachments.map((attachment, index) => (
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
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <MessageInput
          onSendMessage={handleSendMessage}
          fileUploadComponent={
            <FileUpload 
              channelId={0} 
              directMessageId={messages[0]?.message?.directMessageId}
            />
          }
        />
      </div>
    </div>
  );
}