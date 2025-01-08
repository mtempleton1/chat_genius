import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChatSidebar from "@/components/chat/ChatSidebar";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import WorkspaceSidebar from "@/components/chat/WorkspaceSidebar";
import WorkspaceSelector from "@/components/chat/WorkspaceSelector";
import DirectMessageChat from "@/components/chat/DirectMessageChat";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";

type Channel = {
  id: number;
  name: string;
  workspaceId: number;
  isPrivate: boolean;
  createdById: number;
  createdAt?: string;
  members?: Array<{
    userId: number;
    role: string;
  }>;
};

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
  const [location, setLocation] = useLocation();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('home');

  // Get workspace ID from URL if it exists
  const workspaceId = location.startsWith('/workspace/') 
    ? parseInt(location.split('/')[2], 10) 
    : null;

  const { data: workspace, isLoading: isLoadingWorkspace } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${workspaceId}`],
    enabled: !!workspaceId && workspaceId > 0,
  });

  // Query for channels when workspace is selected
  const { data: channels } = useQuery<Channel[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
    enabled: !!workspaceId && workspaceId > 0,
  });

  // Query for workspace users
  const { data: users, isLoading: isLoadingUsers } = useQuery<{ username: string; id: number }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/users`],
    enabled: !!workspaceId && workspaceId > 0,
  });

  // Reset selections when workspace changes
  useEffect(() => {
    setSelectedChannelId(null);
    setSelectedUserId(null);
    setSelectedThreadId(null);
  }, [workspaceId]);

  if (!user) return null;

  const handleWorkspaceSelect = (selectedWorkspaceId: number) => {
    setLocation(`/workspace/${selectedWorkspaceId}`);
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
          {user && (
            <UserPresence 
              user={{
                id: user.id,
                username: user.username,
                status: 'online',
                avatar: null,
                lastSeen: null,
                createdAt: null,
                password: ''
              }}
            />
          )}
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

          <ResizableHandle />

          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <ChatSidebar
              workspaceId={workspace.id}
              selectedChannelId={selectedChannelId}
              selectedUserId={selectedUserId}
              onSelectChannel={setSelectedChannelId}
              onSelectDirectMessage={setSelectedUserId}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50}>
            {selectedUserId && users ? (
              <DirectMessageChat
                userId={selectedUserId}
                username={users.find(u => u.id === selectedUserId)?.username || ''}
              />
            ) : (
              <MessageList
                channelId={selectedChannelId}
                channelName={channels?.find(c => c.id === selectedChannelId)?.name}
                onThreadSelect={setSelectedThreadId}
              />
            )}
          </ResizablePanel>

          {selectedThreadId && !selectedUserId && (
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
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select a workspace to continue
        </div>
      )}
    </div>
  );
}