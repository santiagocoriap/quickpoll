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
  EmptyState,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { useI18n } from "@/components/providers";
import { FieldLabel } from "@/components/info-tip";
import { Plus, Trash2, UsersRound } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  members: number;
}

export function GroupsManager({ initial }: { initial: Group[] }) {
  const { dict } = useI18n();
  const g = dict.groups;
  const [groups, setGroups] = useState<Group[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { group } = await api<{ group: Group }>("/api/groups", {
        method: "POST",
        body: {
          name: fd.get("name"),
          description: fd.get("description") || undefined,
          priority: Number(fd.get("priority") || 0),
        },
      });
      setGroups((g) => [...g, { ...group, members: 0 }]);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(g.deleteConfirm)) return;
    await api(`/api/groups/${id}`, { method: "DELETE" });
    setGroups((list) => list.filter((x) => x.id !== id));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{g.title}</h1>
          <p className="text-sm text-muted-foreground">{g.subtitle}</p>
        </div>
        {groups.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-6" />} title={g.emptyTitle} description={g.emptyDesc} />
        ) : (
          <div className="grid gap-3">
            {groups.map((grp) => (
              <Card key={grp.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{grp.name}</span>
                      <Badge tone="gray">{g.priority.toLowerCase()} {grp.priority}</Badge>
                      <Badge tone="blue">{grp.members} {g.members}</Badge>
                    </div>
                    {grp.description && <p className="mt-1 text-sm text-muted-foreground">{grp.description}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(grp.id)}>
                    <Trash2 />
                    {dict.common.delete}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{g.newGroup}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">{g.name}</Label>
              <Input id="name" name="name" required placeholder="Previous Champion" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">{g.description}</Label>
              <Textarea id="description" name="description" placeholder={dict.common.optional} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={g.priority} tip={g.priorityHelp} htmlFor="priority" />
              <Input id="priority" name="priority" type="number" defaultValue={0} min={0} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              <Plus />
              {busy ? g.adding : g.add}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
