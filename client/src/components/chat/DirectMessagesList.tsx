import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
  const { data: users = [] } = useQuery<User[]>({
    queryKey: [`/api/workspaces/${workspaceId}/users`],
    enabled: !!workspaceId,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Direct Messages</h2>
      </div>
      <div className="space-y-1">
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            className={cn(
              "w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm",
              "hover:bg-accent hover:text-accent-foreground",
              selectedUserId === user.id && "bg-accent text-accent-foreground"
            )}
          >
            <Avatar className="h-5 w-5">
              <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs uppercase">
                {user.username[0]}
              </div>
            </Avatar>
            <span>{user.username}</span>
            {user.status === 'online' && (
              <div className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}