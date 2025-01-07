import { useState, type FormEvent } from "react";
import { Send, Bold, Italic, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type MessageInputProps = {
  onSendMessage: (content: string, options?: { parentId?: number }) => void;
  fileUploadComponent: React.ReactNode;
};

export default function MessageInput({ onSendMessage, fileUploadComponent }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [showToolbar, setShowToolbar] = useState(true);
  const [format, setFormat] = useState<string[]>([]);

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
    <div className="flex flex-col gap-2">
      {showToolbar && (
        <div className="flex items-center gap-1 p-2 bg-secondary/20 rounded-md">
          <ToggleGroup 
            type="multiple" 
            value={format} 
            onValueChange={setFormat}
          >
            <ToggleGroupItem value="bold" aria-label="Toggle bold">
              <Bold className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Toggle italic">
              <Italic className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

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

        <div className="flex flex-col gap-1">
          <Button 
            type="button" 
            size="icon" 
            variant="ghost"
            onClick={() => setShowToolbar(prev => !prev)}
            className="h-6 w-6"
          >
            {showToolbar ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button type="submit" size="icon" disabled={!content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}