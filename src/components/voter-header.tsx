"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { Controls } from "@/components/controls";
import { Vote, LogOut, Shield } from "lucide-react";

export function VoterHeader({ user }: { user: { name: string; isAdmin: boolean } }) {
  const router = useRouter();
  const { dict } = useI18n();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 items-center justify-between gap-3">
        <Link href="/me" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Vote className="size-4" />
          </span>
          PollForge
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user.isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Shield className="size-4" />
              {dict.common.admin}
            </Link>
          )}
          <span className="hidden text-muted-foreground sm:inline">{user.name}</span>
          <Controls />
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut />
            <span className="hidden sm:inline">{dict.common.signOut}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
