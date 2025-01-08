import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type FileUploadProps = {
  channelId: number;
  directMessageId?: number | null;
};

export default function FileUpload({ channelId, directMessageId }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = "image/*,.pdf,.doc,.docx,.txt";

  const handleUpload = async (files: FileList) => {
    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "Error",
            description: "File size must be less than 5MB",
            variant: "destructive",
          });
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("channelId", channelId.toString());
        if (directMessageId) {
          formData.append("directMessageId", directMessageId.toString());
        }

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
      }

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  fileInput.onchange = (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files) {
      handleUpload(files);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => fileInput.click()}
      disabled={isUploading}
    >
      {isUploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Paperclip className="h-4 w-4" />
      )}
    </Button>
  );
}