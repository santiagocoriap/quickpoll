import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, canManagePoll } from "@/lib/auth";
import { computeSection, loadSectionBallots } from "@/lib/poll-service";
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

  // Individual ballots per section, for the admin "who voted for what" view.
  // ANONYMOUS sections keep the voter list (participation) but drop the choices.
  const sectionBallots = await Promise.all(
    poll.sections.map(async (s) => {
      const choicesHidden = s.anonymity === "ANONYMOUS";
      const ballots = await loadSectionBallots(s.id);
      return {
        sectionId: s.id,
        title: s.title,
        anonymity: s.anonymity,
        method: s.method,
        choicesHidden,
        count: ballots.length,
        ballots: choicesHidden ? ballots.map((b) => ({ ...b, selections: [] })) : ballots,
      };
    })
  );

  return (
    <PollDetail
      poll={JSON.parse(JSON.stringify(poll))}
      results={JSON.parse(JSON.stringify(sectionResults))}
      ballots={JSON.parse(JSON.stringify(sectionBallots))}
      shareUrl={appUrl(`/p/${poll.slug}`)}
    />
  );
}
