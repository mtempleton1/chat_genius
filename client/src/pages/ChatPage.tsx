import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import { useUser } from "@/hooks/use-user";

export default function ChatPage() {
  const { user } = useUser();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-4 py-3 bg-background">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">ChatGenius</h1>
          <UserPresence user={user} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <ChannelList
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
          />
        </ResizablePanel>
        
        <ResizableHandle />
        
        <ResizablePanel defaultSize={50}>
          <MessageList
            channelId={selectedChannelId}
            onThreadSelect={setSelectedThreadId}
          />
        </ResizablePanel>

        {selectedThreadId && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={30}>
              <ThreadView
                messageId={selectedThreadId}
                onClose={() => setSelectedThreadId(null)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
