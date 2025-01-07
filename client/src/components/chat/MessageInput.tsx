import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MessageInputProps = {
  onSendMessage: (content: string, options?: { parentId?: number }) => void;
  fileUploadComponent: React.ReactNode;
};

export default function MessageInput({ onSendMessage, fileUploadComponent }: MessageInputProps) {
  const [content, setContent] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSendMessage(content);
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="min-h-[20px] resize-none"
          rows={1}
        />
      </div>

      {fileUploadComponent}

      <Button type="submit" size="icon" disabled={!content.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}