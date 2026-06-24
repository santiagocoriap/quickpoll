import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, EmptyState, LinkButton } from "@/components/ui";
import { LocalizedStatus } from "@/components/localized";
import { Plus, ChevronRight, ListChecks, Layers, Users } from "lucide-react";

export default async function AdminPolls() {
  const user = (await getCurrentUser())!;
  const dict = getDict();
  const where = user.role === "SUPER_ADMIN" ? {} : { ownerId: user.id };
  const polls = await prisma.poll.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true } },
      _count: { select: { sections: true, votes: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dict.polls.title}</h1>
          <p className="text-sm text-muted-foreground">{dict.polls.subtitle}</p>
        </div>
        <LinkButton href="/admin/polls/new">
          <Plus />
          {dict.polls.newPoll}
        </LinkButton>
      </div>

      {polls.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-6" />}
          title={dict.polls.emptyTitle}
          description={dict.polls.emptyDesc}
          action={
            <LinkButton href="/admin/polls/new">
              <Plus />
              {dict.polls.createPoll}
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-3">
          {polls.map((p) => (
            <Link key={p.id} href={`/admin/polls/${p.id}`} className="group">
              <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{p.title}</h3>
                      <LocalizedStatus status={p.status} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="size-3.5" /> {p._count.sections} {dict.polls.sections}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" /> {p._count.votes} {dict.polls.votes}
                      </span>
                      <span>
                        {dict.common.by} {p.owner.name} · {formatDate(p.createdAt)}
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
