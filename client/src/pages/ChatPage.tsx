import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import WorkspaceSidebar from "@/components/chat/WorkspaceSidebar";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";

type Workspace = {
  id: number;
  name: string;
  organizationId: number;
  createdAt: string;
  organization?: {
    id: number;
    name: string;
    domain?: string;
  };
};

export default function ChatPage() {
  const { user } = useUser();
  const [location] = useLocation();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('home');

  // Get workspace ID from URL or user context
  const workspaceId = location.startsWith('/workspace/') 
    ? parseInt(location.split('/')[2], 10)
    : user?.workspaceId;

  const { data: workspace, isLoading: isLoadingWorkspace } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${workspaceId}`],
    enabled: !!workspaceId,
  });

  if (!user) return null;

  if (isLoadingWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-4 py-3 bg-background">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{workspace?.name ?? 'Loading workspace...'}</h1>
          <UserPresence user={user} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={7} minSize={7} maxSize={7}>
          <WorkspaceSidebar
            activeView={activeView}
            onViewChange={setActiveView}
          />
        </ResizablePanel>

        {activeView === 'home' && (
          <>
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
          </>
        )}

        {activeView === 'dms' && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Direct Messages feature coming soon
          </div>
        )}

        {activeView === 'activity' && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Activity feed feature coming soon
          </div>
        )}
      </ResizablePanelGroup>
    </div>
  );
}