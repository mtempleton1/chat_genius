import { useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@db/schema";

type UserPresenceProps = {
  user: User;
};

export default function UserPresence({ user }: UserPresenceProps) {
  const { logout } = useUser();
  const { addMessageHandler } = useWebSocket();

  useEffect(() => {
    return addMessageHandler((msg) => {
      if (msg.type === "userStatus") {
        // Update user status in UI
      }
    });
  }, [addMessageHandler]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus:outline-none">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={user.avatar ?? undefined} alt={user.username} />
            <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <div className="font-medium">{user.username}</div>
            <div className="text-xs text-muted-foreground">
              {user.status === "online" ? "Active" : "Away"}
            </div>
          </div>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => logout()}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}