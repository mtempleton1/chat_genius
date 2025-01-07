import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Hash, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { Channel } from "@db/schema";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";

type ChannelListProps = {
  selectedChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
};

export default function ChannelList({ selectedChannelId, onSelectChannel }: ChannelListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();

  const workspaceId = user?.workspaceId;

  const { data: channels } = useQuery<Channel[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
    enabled: !!workspaceId,
  });

  const createChannel = useMutation({
    mutationFn: async (data: { name: string; isPrivate: boolean }) => {
      if (!workspaceId) throw new Error("No workspace selected");

      const response = await fetch(`/api/workspaces/${workspaceId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/channels`] });
      setIsCreateOpen(false);
      toast({
        title: "Success",
        description: "Channel created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create channel",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await createChannel.mutate({
      name: formData.get("name") as string,
      isPrivate: formData.get("private") === "on",
    });
  };

  if (!workspaceId) return null;

  return (
    <div className="h-full flex flex-col p-4 border-r">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Channels</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Channel</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Channel Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="private" name="private" />
                <Label htmlFor="private">Private Channel</Label>
              </div>
              <Button type="submit" className="w-full" disabled={createChannel.isPending}>
                {createChannel.isPending ? "Creating..." : "Create Channel"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 -mx-4">
        <div className="px-4 space-y-1">
          {channels?.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={cn(
                "w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                selectedChannelId === channel.id && "bg-accent text-accent-foreground"
              )}
            >
              {channel.isPrivate ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Hash className="h-4 w-4" />
              )}
              <span>{channel.name}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}