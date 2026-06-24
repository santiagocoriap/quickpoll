"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { useI18n } from "@/components/providers";
import { Check, Plus } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  groupIds: string[];
}
interface GroupRef {
  id: string;
  name: string;
}

export function UsersManager({
  initial,
  groups,
  isSuperAdmin,
}: {
  initial: UserRow[];
  groups: GroupRef[];
  isSuperAdmin: boolean;
}) {
  const { dict } = useI18n();
  const u = dict.users;
  const [users, setUsers] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const groupIds = groups.filter((g) => fd.get(`g_${g.id}`)).map((g) => g.id);
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          role: fd.get("role"),
          groupIds,
        },
      });
      location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function toggleGroup(u: UserRow, groupId: string) {
    const next = u.groupIds.includes(groupId)
      ? u.groupIds.filter((g) => g !== groupId)
      : [...u.groupIds, groupId];
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, groupIds: next } : x)));
    await api(`/api/users/${u.id}`, { method: "PATCH", body: { groupIds: next } });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{u.title}</h1>
          <p className="text-sm text-muted-foreground">{u.subtitle}</p>
        </div>
        <div className="grid gap-3">
          {users.map((row) => (
            <Card key={row.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{row.name}</span>{" "}
                    <span className="text-sm text-muted-foreground">{row.email}</span>
                  </div>
                  <Badge tone={row.role === "VOTER" ? "gray" : "primary"}>
                    {(dict.roles as Record<string, string>)[row.role] ?? row.role}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const on = row.groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(row, g.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          on ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {on && <Check className="size-3" />}
                        {g.name}
                      </button>
                    );
                  })}
                  {groups.length === 0 && <span className="text-xs text-muted-foreground">{u.noGroups}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{u.addUser}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">{u.name}</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{u.email}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{u.tempPassword}</Label>
              <Input id="password" name="password" type="text" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">{u.role}</Label>
              <Select id="role" name="role" defaultValue="VOTER">
                <option value="VOTER">{dict.roles.VOTER}</option>
                {isSuperAdmin && <option value="POLL_ADMIN">{dict.roles.POLL_ADMIN}</option>}
                {isSuperAdmin && <option value="SUPER_ADMIN">{dict.roles.SUPER_ADMIN}</option>}
              </Select>
            </div>
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <Label>{u.groups}</Label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name={`g_${g.id}`} /> {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              <Plus />
              {busy ? u.adding : u.addUser}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
