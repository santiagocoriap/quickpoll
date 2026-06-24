import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { VoterHeader } from "@/components/voter-header";
import { Card, CardContent, EmptyState } from "@/components/ui";
import { LocalizedStatus } from "@/components/localized";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Layers, CalendarClock, Inbox } from "lucide-react";

export default async function MyPolls() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dict = getDict();

  // Polls the user can see: public, or private where they have access (direct or via group),
  // and visible statuses.
  const polls = await prisma.poll.findMany({
    where: {
      status: { in: ["OPEN", "CLOSED", "NEEDS_TIEBREAK", "FINALIZED"] },
      OR: [
        { visibility: "PUBLIC" },
        { access: { some: { userId: user.id } } },
        { access: { some: { groupId: { in: user.groupIds } } } },
        // private polls with no explicit access list are open to all registered voters
        { AND: [{ visibility: "PRIVATE" }, { access: { none: {} } }] },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sections: true } } },
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <VoterHeader user={{ name: user.name, isAdmin: isAdmin(user.role) }} />
      <main className="container max-w-3xl py-8">
        <h1 className="mb-1 text-2xl font-bold">{dict.me.title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{dict.me.subtitle}</p>
        {polls.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title={dict.me.emptyTitle} description={dict.me.emptyDesc} />
        ) : (
          <div className="grid gap-3">
            {polls.map((p) => (
              <Link key={p.id} href={`/p/${p.slug}`} className="group">
                <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{p.title}</h3>
                        <LocalizedStatus status={p.status} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3.5" /> {p._count.sections} {dict.me.sections}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3.5" /> {dict.me.closes} {formatDate(p.closesAt)}
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
      </main>
    </div>
  );
}
