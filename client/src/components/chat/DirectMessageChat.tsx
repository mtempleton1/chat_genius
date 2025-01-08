import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

type DirectMessageChatProps = {
  userId: number;
  username: string;
};

export default function DirectMessageChat({ userId, username }: DirectMessageChatProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2 flex items-center space-x-2">
        <Avatar className="h-6 w-6">
          <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs uppercase">
            {username[0]}
          </div>
        </Avatar>
        <span className="font-medium">{username}</span>
      </div>
      <div className="flex-1 p-4">
        <Card className="h-full flex items-center justify-center text-muted-foreground">
          <p>Direct message chat with {username} will be implemented here</p>
        </Card>
      </div>
    </div>
  );
}
