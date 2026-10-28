"use client";
import { useTransition } from "react";
import { RefreshCw, FolderCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { syncDriveAction, setFolderAction } from "@/app/actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button
      loading={pending}
      icon={<RefreshCw className="size-4" />}
      onClick={() =>
        start(async () => {
          const r = await syncDriveAction();
          toast(r.ok ? { tone: "info", message: "Sync started. New clips will appear shortly." } : { tone: "error", message: r.error });
        })
      }
    >
      Sync now
    </Button>
  );
}

export function SetFolderButton({ folderId, folderName }: { folderId: string; folderName: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant="subtle"
      loading={pending}
      icon={<FolderCheck className="size-4" />}
      onClick={() =>
        start(async () => {
          const r = await setFolderAction("source", folderId, folderName);
          toast(r.ok ? { tone: "success", message: `“${folderName}” is now your source folder` } : { tone: "error", message: r.error });
        })
      }
    >
      Use as source folder
    </Button>
  );
}
