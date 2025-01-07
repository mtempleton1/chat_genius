import { Home, MessageCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkspaceSidebarProps = {
  activeView: string;
  onViewChange: (view: string) => void;
};

export default function WorkspaceSidebar({ activeView, onViewChange }: WorkspaceSidebarProps) {
  const views = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'dms', icon: MessageCircle, label: 'Direct Messages' },
    { id: 'activity', icon: Activity, label: 'Activity' }
  ];

  return (
    <div className="w-[72px] h-full flex flex-col items-center gap-2 p-3 border-r bg-sidebar">
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
  );
}
