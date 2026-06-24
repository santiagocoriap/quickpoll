import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin, canManagePoll } from "@/lib/auth";
import { getEligibility, getPhaseEligibility, computeSection } from "@/lib/poll-service";
import { getDict } from "@/lib/i18n-server";
import { VoterHeader } from "@/components/voter-header";
import { LocalizedStatus } from "@/components/localized";
import { VoteForms } from "./vote-forms";

function resultsVisible(visibility: string, hasVoted: boolean, pollStatus: string, admin: boolean): boolean {
  if (admin) return true;
  switch (visibility) {
    case "ALWAYS":
      return true;
    case "AFTER_VOTE":
      return hasVoted;
    case "AFTER_CLOSE":
      return ["CLOSED", "NEEDS_TIEBREAK", "FINALIZED"].includes(pollStatus);
    default:
      return false;
  }
}

export default async function VotePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { preview?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login`);
  const dict = getDict();

  const poll = await prisma.poll.findUnique({
    where: { slug: params.slug },
    include: {
      access: true,
      sections: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } }, phases: { orderBy: { phaseIndex: "asc" } } },
      },
    },
  });
  if (!poll) notFound();

  const admin = canManagePoll(user, poll);
  // Access check for private polls.
  if (poll.visibility === "PRIVATE" && poll.access.length > 0 && !admin) {
    const ok =
      poll.access.some((a) => a.userId === user.id) ||
      poll.access.some((a) => a.groupId && user.groupIds.includes(a.groupId));
    if (!ok) redirect("/me");
  }

  const isOpen = poll.status === "OPEN";

  // The voter's groups (for a friendly "you are in the X group" explanation).
  const userGroups = await prisma.userGroup.findMany({
    where: { userId: user.id },
    include: { group: true },
  });

  // Build per-section voter data.
  const sections = await Promise.all(
    poll.sections.map(async (s) => {
      const evaluated = await getEligibility(s.id, user.id);
      const eligibility = evaluated?.eligibility;

      // Determine which group drives the limit, for the localized explanation.
      let drivingGroup: string | undefined;
      if (evaluated) {
        const limited = evaluated.section.groupLimits.filter(
          (l) => l.maxSelections != null || l.exactSelections != null
        );
        const mine = userGroups
          .filter((ug) => limited.some((l) => l.groupId === ug.groupId))
          .sort((a, b) => b.group.priority - a.group.priority);
        drivingGroup = mine[0]?.group.name;
      }

      const existingVote = await prisma.vote.findFirst({
        where: { sectionId: s.id, phaseId: null, userId: user.id },
        include: { selections: true },
      });

      // Sequential-stage state for this section.
      const stageDone = poll.sequential && s.position < poll.currentStage;
      const stageActive = !poll.sequential || s.position === poll.currentStage;
      const stagePending = poll.sequential && s.position > poll.currentStage;
      const stageState: "active" | "done" | "pending" = stagePending ? "pending" : stageDone ? "done" : "active";

      // Once a runoff exists for this section, its original round is locked.
      const runoffLocked = s.phases.length > 0;
      const votable = poll.status === "OPEN" && stageActive && !runoffLocked;

      const baseShow = resultsVisible(s.resultVisibility, Boolean(existingVote), poll.status, admin);
      // A finished sequential stage behaves like a closed poll for result visibility,
      // so voters can see its outcome before voting on the next stage.
      const showResults = baseShow || (stageDone && s.resultVisibility !== "ADMIN_ONLY");
      const computed = showResults ? await computeSection(s.id, null) : null;

      // Open runoff phases the voter can participate in.
      const openPhases = await Promise.all(
        s.phases
          .filter((p) => p.status === "OPEN")
          .map(async (p) => {
          const phaseVote = await prisma.vote.findFirst({
            where: { sectionId: s.id, phaseId: p.id, userId: user.id },
            include: { selections: true },
          });
          const optionIds = Array.isArray(p.optionIds) ? (p.optionIds as string[]) : [];
          const pe = await getPhaseEligibility(p.id, user.id);
          return {
            id: p.id,
            label: p.label,
            method: p.method,
            optionIds,
            eligibility: pe?.eligibility,
            existing: phaseVote?.selections.map((x) => ({ optionId: x.optionId, rank: x.rank, score: x.score })) ?? null,
          };
        })
      );

      return {
        id: s.id,
        title: s.title,
        description: s.description,
        method: s.method,
        scoreMin: s.scoreMin,
        scoreMax: s.scoreMax,
        options: s.options.map((o) => ({ id: o.id, label: o.label, description: o.description })),
        eligibility,
        drivingGroup,
        stageState,
        votable,
        runoffLocked,
        existing: existingVote?.selections.map((x) => ({ optionId: x.optionId, rank: x.rank, score: x.score })) ?? null,
        results: computed ? computed.result : null,
        turnout: computed ? { ballotsCast: computed.ballotsCast, eligibleVoters: computed.eligibleVoters, turnout: computed.turnout } : null,
        openPhases,
      };
    })
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <VoterHeader user={{ name: user.name, isAdmin: isAdmin(user.role) }} />
      <main className="container max-w-2xl py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{poll.title}</h1>
            <LocalizedStatus status={poll.status} />
          </div>
          {poll.description && <p className="mt-1 text-sm text-muted-foreground">{poll.description}</p>}
          {searchParams.preview && (
            <p className="mt-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">{dict.vote.previewMode}</p>
          )}
          {!isOpen && poll.status !== "CLOSED" && poll.status !== "FINALIZED" && poll.status !== "NEEDS_TIEBREAK" && (
            <p className="mt-2 text-sm text-amber-700">{dict.vote.notOpenYet}</p>
          )}
        </div>
        <VoteForms sections={sections} canVote={isOpen} />
      </main>
    </div>
  );
}
