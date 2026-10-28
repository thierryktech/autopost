"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { completeOnboardingAction } from "@/app/actions";

export function FinishButton({ done }: { done: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="primary" size="lg" loading={pending} onClick={() => start(async () => { await completeOnboardingAction(); router.push("/"); })}>
      {done ? "Back to Overview" : "Finish setup"}
    </Button>
  );
}
