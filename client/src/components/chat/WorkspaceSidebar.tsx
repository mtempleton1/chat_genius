import { Home, MessageCircle, Activity, User, Settings, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type WorkspaceSidebarProps = {
  activeView: string;
  onViewChange: (view: string) => void;
};

export default function WorkspaceSidebar({ activeView, onViewChange }: WorkspaceSidebarProps) {
  const { user } = useUser();
  const [status, setStatus] = useState(user?.status || "");
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch('/api/user/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    }
  });

  const views = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'dms', icon: MessageCircle, label: 'Direct Messages' },
    { id: 'activity', icon: Activity, label: 'Activity' }
  ];

  const handleStatusUpdate = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      await updateStatus.mutateAsync(e.currentTarget.value);
      setStatus("");
    }
  };

  return (
    <div className="w-[72px] h-full flex flex-col items-center bg-sidebar">
      <div className="flex-1 flex flex-col items-center gap-2 p-3 border-r">
        {views.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            variant="ghost"
            size="icon"
            className={cn(
              "w-11 h-11 rounded-lg",
              activeView === id && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
            onClick={() => onViewChange(id)}
          >
            <Icon className="h-5 w-5" />
            <span className="sr-only">{label}</span>
          </Button>
        ))}
      </div>

      <div className="p-3 border-t border-r w-full">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-11 h-11 rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground relative"
            >
              <User className="h-5 w-5" />
              {user?.status && (
                <div className="absolute bottom-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
              <span className="sr-only">User Profile</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-80 p-4">
            <div className="space-y-4">
              {user ? (
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-sidebar-accent flex items-center justify-center">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.username}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <UserCircle className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{user.username}</h4>
                    <p className="text-xs text-muted-foreground">
                      {user.status || "No status set"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Update your status
                </label>
                <Input 
                  placeholder="What's on your mind?"
                  className="h-8"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  onKeyDown={handleStatusUpdate}
                  disabled={updateStatus.isPending}
                />
              </div>

              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start h-8 px-2 text-sm gap-2"
                >
                  <UserCircle className="h-4 w-4" />
                  Profile
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start h-8 px-2 text-sm gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Preferences
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}