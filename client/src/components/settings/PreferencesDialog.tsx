import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Bell, Compass, Palette, Video, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

type PreferenceSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const preferenceSections: PreferenceSection[] = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "navigation", label: "Navigation", icon: Compass },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "audio-video", label: "Audio & Video", icon: Video },
  { id: "advanced", label: "Advanced", icon: Settings2 },
];

type PreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function PreferencesDialog({
  open,
  onOpenChange,
}: PreferencesDialogProps) {
  const [activeSection, setActiveSection] = useState<string>("notifications");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0">
        {/* Header */}
        <div className="flex items-center p-4 border-b">
          <h2 className="text-lg font-bold">Preferences</h2>
        </div>

        <div className="flex h-[32rem]">
          {/* Sidebar */}
          <div className="w-56 border-r shrink-0">
            <nav className="p-2 space-y-1">
              {preferenceSections.map((section) => {
                const Icon = section.icon;
                return (
                  <Button
                    key={section.id}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2 font-normal",
                      activeSection === section.id &&
                        "bg-accent text-accent-foreground font-medium"
                    )}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6">
            <h3 className="text-lg font-medium capitalize mb-4">
              {activeSection.replace("-", " ")}
            </h3>
            <p className="text-muted-foreground">
              {activeSection.replace("-", " ")} preferences coming soon
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}