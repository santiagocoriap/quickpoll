import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, canManagePoll } from "@/lib/auth";
import { computeSection } from "@/lib/poll-service";
import { appUrl } from "@/lib/utils";
import { PollDetail } from "./poll-detail";

export default async function PollDetailPage({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } }, phases: { orderBy: { phaseIndex: "asc" } } },
      },
      access: { include: { group: true, user: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true } } } },
    },
  });
  if (!poll) notFound();
  if (!canManagePoll(user, poll)) redirect("/admin");

  // Compute results per section (original round) and per phase.
  const sectionResults = await Promise.all(
    poll.sections.map(async (s) => {
      const original = await computeSection(s.id, null);
      const phases = await Promise.all(
        s.phases.map(async (p) => {
          const optionIds = Array.isArray(p.optionIds) ? (p.optionIds as string[]) : undefined;
          const computed = await computeSection(s.id, p.id, optionIds, p.seats, p.method);
          return { phase: p, computed };
        })
      );
      return { sectionId: s.id, original, phases };
    })
  );

  return (
    <PollDetail
      poll={JSON.parse(JSON.stringify(poll))}
      results={JSON.parse(JSON.stringify(sectionResults))}
      shareUrl={appUrl(`/p/${poll.slug}`)}
    />
  );
}
