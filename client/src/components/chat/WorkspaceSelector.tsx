import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: workspaces, isLoading, error } = useQuery<Workspace[]>({
    queryKey: ['/api/user/workspaces'],
  });

  // Add mutation for setting workspace
  const setWorkspace = useMutation({
    mutationFn: async (workspaceId: number) => {
      const response = await fetch('/api/user/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], (old: any) => ({
        ...old,
        workspaceId: data.user.workspaceId,
      }));
      // Only call onSelect after the workspace is successfully updated
      onSelect(data.user.workspaceId);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to switch workspace',
        variant: 'destructive',
      });
    },
  });

  const handleSelect = async (workspaceId: string) => {
    const id = parseInt(workspaceId, 10);
    try {
      // Only call setWorkspace mutation, onSelect will be called after success
      await setWorkspace.mutateAsync(id);
    } catch (error) {
      // Error is handled in mutation
    }
  };

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
    <Select onValueChange={handleSelect}>
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