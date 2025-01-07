import { useState } from "react";
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
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load workspaces</div>;
  }

  if (!workspaces?.length) {
    return <div className="text-muted-foreground">No workspaces available</div>;
  }

  return (
    <Select onValueChange={(value) => onSelect(parseInt(value, 10))}>
      <SelectTrigger className="w-[250px]">
        <SelectValue placeholder="Select a workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id.toString()}>
            <span className="flex items-center gap-2">
              {workspace.name}
              {workspace.organization && (
                <span className="text-xs text-muted-foreground">
                  ({workspace.organization.name})
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}