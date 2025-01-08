import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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

type Message = {
  message: {
    id: number;
    directMessageId?: number | null;
  }
}

export default function ChatPage() {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null,
  );
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [threadDirectMessageId, setThreadDirectMessageId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState("home");

  // Get workspace ID from URL if it exists
  const workspaceId = location.startsWith("/workspace/")
    ? parseInt(location.split("/")[2], 10)
    : null;

  const { data: workspace, isLoading: isLoadingWorkspace } =
    useQuery<Workspace>({
      queryKey: [`/api/workspaces/${workspaceId}`],
      enabled: !!workspaceId && workspaceId > 0,
    });

  // Query for channels when workspace is selected
  const { data: channels } = useQuery<Channel[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
    enabled: !!workspaceId && workspaceId > 0,
  });

  // Query for workspace users
  const { data: users, isLoading: isLoadingUsers } = useQuery<
    { username: string; id: number }[]
  >({
    queryKey: [`/api/workspaces/${workspaceId}/users`],
    enabled: !!workspaceId && workspaceId > 0,
  });

  // Mock messages data -  REPLACE THIS WITH YOUR ACTUAL MESSAGE QUERY
  const [messages, setMessages] = useState<Message[] | null>(null);
  useEffect(() => {
    // Fetch messages based on selectedChannelId or selectedUserId
    const fetchMessages = async () => {
      if (selectedChannelId) {
        // Fetch messages for channel
        const response = await fetch(`/api/channels/${selectedChannelId}/messages`);
        const data = await response.json();
        setMessages(data);
      } else if (selectedUserId) {
        // Fetch messages for direct message
        const response = await fetch(`/api/users/${selectedUserId}/messages`);
        const data = await response.json();
        setMessages(data);
      } else {
        setMessages(null);
      }
    };
    fetchMessages();
  }, [selectedChannelId, selectedUserId]);


  // Reset selections when workspace changes
  useEffect(() => {
    setSelectedChannelId(null);
    setSelectedUserId(null);
    setSelectedThreadId(null);
    setThreadDirectMessageId(null);
    setMessages(null);
  }, [workspaceId]);

  // Modified selection handlers for mutual exclusivity
  const handleChannelSelect = (channelId: number) => {
    setSelectedUserId(null); // Clear DM selection when selecting a channel
    setSelectedChannelId(channelId);
  };

  const handleDirectMessageSelect = (userId: number) => {
    setSelectedChannelId(null); // Clear channel selection when selecting a DM
    setSelectedUserId(userId);
  };

  const handleThreadSelect = (messageId: number, directMessageId?: number | null) => {
    setSelectedThreadId(messageId);
    setThreadDirectMessageId(directMessageId || null);
  };

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
                status: "online",
                avatar: null,
                lastSeen: null,
                createdAt: null,
                password: "",
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
              onSelectChannel={handleChannelSelect}
              onSelectDirectMessage={handleDirectMessageSelect}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50}>
            {selectedUserId && users && messages ? (
              <DirectMessageChat
                userId={selectedUserId}
                username={
                  users.find((u) => u.id === selectedUserId)?.username || ""
                }
                workspaceId={workspace!.id}
                messages={messages}
                onThreadSelect={(messageId) => {
                  const message = messages?.find(m => m.message.id === messageId);
                  handleThreadSelect(messageId, message?.message.directMessageId);
                }}
              />
            ) : (
              <MessageList
                channelId={selectedChannelId}
                channelName={
                  channels?.find((c) => c.id === selectedChannelId)?.name
                }
                onThreadSelect={(messageId) => handleThreadSelect(messageId)}
              />
            )}
          </ResizablePanel>

          {selectedThreadId && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={30}>
                <ThreadView
                  messageId={selectedThreadId}
                  directMessageId={threadDirectMessageId}
                  onClose={() => {
                    setSelectedThreadId(null);
                    setThreadDirectMessageId(null);
                  }}
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