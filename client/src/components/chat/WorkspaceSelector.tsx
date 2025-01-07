import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type Workspace = {
  id: number;
  name: string;
  organization: {
    id: number;
    name: string;
    domain?: string;
  } | null;
  role: string;
};

type WorkspaceSelectorProps = {
  onSelect: (workspaceId: number) => void;
};

export default function WorkspaceSelector({ onSelect }: WorkspaceSelectorProps) {
  const { data: workspaces, isLoading, error } = useQuery<Workspace[]>({
    queryKey: ['/api/user/workspaces'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading workspaces...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive flex items-center gap-2">
        <span>Failed to load workspaces</span>
        <button 
          onClick={() => window.location.reload()} 
          className="text-sm underline hover:text-destructive/90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspaces?.length) {
    return <div className="text-muted-foreground">No workspaces available</div>;
  }

  return (
    <Select onValueChange={(value) => onSelect(parseInt(value, 10))}>
      <SelectTrigger className="w-[300px]">
        <SelectValue placeholder="Select a workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem 
            key={workspace.id} 
            value={workspace.id.toString()}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="font-medium">{workspace.name}</span>
              {workspace.organization && (
                <span className="text-xs text-muted-foreground">
                  {workspace.organization.name}
                </span>
              )}
            </div>
            <span className="text-xs capitalize text-muted-foreground">
              {workspace.role}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}