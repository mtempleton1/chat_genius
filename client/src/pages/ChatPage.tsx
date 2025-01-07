import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import WorkspaceSidebar from "@/components/chat/WorkspaceSidebar";
import WorkspaceSelector from "@/components/chat/WorkspaceSelector";
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

type UserPresenceData = {
  id: number;
  username: string;
  status?: string | null;
  avatar?: string | null;
  lastSeen?: Date | null;
};

export default function ChatPage() {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('home');

  // Get workspace ID from URL if it exists
  const workspaceId = location.startsWith('/workspace/') 
    ? parseInt(location.split('/')[2], 10) 
    : undefined;

  const { data: workspace, isLoading: isLoadingWorkspace } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${workspaceId}`],
    enabled: !!workspaceId,
  });

  // Query for channels when workspace is selected
  const { data: channels } = useQuery({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
    enabled: !!workspaceId,
  });

  if (!user) return null;

  // Prepare user data for UserPresence component
  const userPresenceData: UserPresenceData = {
    id: user.id,
    username: user.username,
    avatar: user.avatar || null,
    status: user.status || null,
    lastSeen: user.lastSeen || null
  };

  const handleWorkspaceSelect = (selectedWorkspaceId: number) => {
    setLocation(`/workspace/${selectedWorkspaceId}`);
    // Reset selected channel and thread when switching workspaces
    setSelectedChannelId(null);
    setSelectedThreadId(null);
  };

  // Only show loading state when we're waiting for a specific workspace
  if (workspaceId && isLoadingWorkspace) {
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
          {workspace ? (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{workspace.name}</h1>
              {workspace.organization && (
                <span className="text-sm text-muted-foreground">
                  ({workspace.organization.name})
                </span>
              )}
            </div>
          ) : (
            <WorkspaceSelector onSelect={handleWorkspaceSelect} />
          )}
          <UserPresence user={userPresenceData} />
        </div>
      </header>

      {workspace ? (
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
                  channels={channels}
                  workspaceId={workspace.id}
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
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select a workspace to continue
        </div>
      )}
    </div>
  );
}