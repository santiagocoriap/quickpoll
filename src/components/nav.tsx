"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { Controls } from "@/components/controls";
import { Vote, LogOut, ListChecks, UsersRound, UserCog } from "lucide-react";

export function AdminNav({ user }: { user: { name: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { dict } = useI18n();

  const links = [
    { href: "/admin", label: dict.nav.polls, icon: ListChecks },
    { href: "/admin/groups", label: dict.nav.groups, icon: UsersRound },
    { href: "/admin/users", label: dict.nav.users, icon: UserCog },
  ];

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel = (dict.roles as Record<string, string>)[user.role] ?? user.role;

  return (
    <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Vote className="size-4" />
            </span>
            PollForge
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => {
              const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground md:inline">
            {user.name} · {roleLabel}
          </span>
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
