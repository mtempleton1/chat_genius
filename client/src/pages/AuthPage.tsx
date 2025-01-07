import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";

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

export default function AuthPage() {
  const { login, register } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [location] = useLocation();

  // Get workspace from URL if available
  const workspaceId = location.startsWith('/workspace/') 
    ? parseInt(location.split('/')[2]) 
    : undefined;

  // Fetch workspace details if workspaceId is present
  const { data: workspace, isLoading: isLoadingWorkspace, error: workspaceError } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${workspaceId}`],
    enabled: !!workspaceId,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>, isLogin: boolean) => {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const organization = formData.get("organization") as string;
    const workspace = formData.get("workspace") as string;

    try {
      const result = isLogin 
        ? await login({ username, password, workspaceId })
        : await register({ username, password, organization, workspace });

      if (!result.ok) {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while fetching workspace details
  if (workspaceId && isLoadingWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Show error state if workspace fetch failed
  if (workspaceId && workspaceError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900">Workspace Not Found</h1>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              The workspace you're trying to access doesn't exist or you don't have permission to access it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {workspace ? `${workspace.name} Login` : "Welcome to ChatGenius"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={(e) => handleSubmit(e, true)} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    name="username"
                    placeholder="Username"
                    required
                  />
                  <Input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    name="username"
                    placeholder="Choose a username"
                    required
                  />
                  <Input
                    name="password"
                    type="password"
                    placeholder="Choose a password"
                    required
                  />
                  {!workspaceId && (
                    <>
                      <Label htmlFor="organization">Organization (Optional)</Label>
                      <Input
                        id="organization"
                        name="organization"
                        placeholder="Organization name"
                      />
                      <Label htmlFor="workspace">Workspace (Optional)</Label>
                      <Input
                        id="workspace"
                        name="workspace"
                        placeholder="Workspace name"
                      />
                    </>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Register"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}