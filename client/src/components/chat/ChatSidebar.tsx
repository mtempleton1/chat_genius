import { ScrollArea } from "@/components/ui/scroll-area";
import ChannelList from "./ChannelList";
import DirectMessagesList from "./DirectMessagesList";

type ChatSidebarProps = {
  workspaceId: number;
  onSelectChannel: (channelId: number) => void;
  onSelectDirectMessage: (userId: number) => void;
  selectedChannelId: number | null;
  selectedUserId: number | null;
};

export default function ChatSidebar({ 
  workspaceId,
  onSelectChannel,
  onSelectDirectMessage,
  selectedChannelId,
  selectedUserId,
}: ChatSidebarProps) {
  return (
    <div className="w-64 h-full border-r flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <ChannelList
            workspaceId={workspaceId}
            selectedChannelId={selectedChannelId}
            onSelectChannel={onSelectChannel}
          />
          <DirectMessagesList
            workspaceId={workspaceId}
            selectedUserId={selectedUserId}
            onSelectUser={onSelectDirectMessage}
          />
        </div>
      </ScrollArea>
    </div>
  );
}