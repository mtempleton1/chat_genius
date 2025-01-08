import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

type User = {
  id: number;
  username: string;
  avatarUrl?: string;
  status?: 'online' | 'offline' | 'away';
};

type DirectMessagesListProps = {
  selectedUserId: number | null;
  onSelectUser: (userId: number) => void;
  workspaceId: number;
};

export default function DirectMessagesList({ 
  selectedUserId, 
  onSelectUser,
  workspaceId 
}: DirectMessagesListProps) {
  console.log('DirectMessagesList rendered with workspaceId:', workspaceId);

  const { data: users, isLoading, error } = useQuery<{ username: string; id: number }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/users`],
    enabled: !!workspaceId,
  });

  const displayedUsers = users || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Direct Messages</h2>
      </div>
      <div className="space-y-1">
        {displayedUsers.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            className={cn(
              "w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm",
              "hover:bg-accent hover:text-accent-foreground",
              selectedUserId === user.id && "bg-accent text-accent-foreground"
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-6 w-6 shrink-0">
                <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium uppercase">
                  {user.username[0]}
                </div>
              </Avatar>
              <span className="truncate">{user.username}</span>
            </div>
            <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        ))}
        {isLoading && (
          <div className="px-2 py-1 text-sm text-muted-foreground">
            Loading users...
          </div>
        )}
        {error && (
          <div className="px-2 py-1 text-sm text-destructive">
            Error loading users
          </div>
        )}
        {!isLoading && !error && displayedUsers.length === 0 && (
          <div className="px-2 py-1 text-sm text-muted-foreground">
            No users found
          </div>
        )}
      </div>
    </div>
  );
}