"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { useMethodLabel } from "@/components/localized";
import { explainEligibility } from "@/lib/i18n";
import { Lock, Trophy, CircleCheck, TriangleAlert } from "lucide-react";

interface OptionRef {
  id: string;
  label: string;
  description?: string | null;
}
interface Eligibility {
  canVote: boolean;
  minSelections: number;
  maxSelections: number | null;
  exactSelections: number | null;
  voteWeight: number;
  scoreMin: number;
  scoreMax: number;
  visibleOptionIds: string[];
  disabledOptionIds: string[];
  explanation: string;
  reasonIfBlocked?: string;
}
interface SectionData {
  id: string;
  title: string;
  description: string | null;
  method: string;
  scoreMin: number;
  scoreMax: number;
  options: OptionRef[];
  eligibility?: Eligibility;
  drivingGroup?: string;
  stageState?: "active" | "done" | "pending";
  votable?: boolean;
  runoffLocked?: boolean;
  existing: { optionId: string; rank: number | null; score: number | null }[] | null;
  results: any | null;
  turnout: { ballotsCast: number; eligibleVoters: number; turnout: number } | null;
  openPhases: {
    id: string;
    label: string;
    method: string;
    optionIds: string[];
    eligibility?: Eligibility;
    existing: any[] | null;
  }[];
}

export function VoteForms({ sections, canVote }: { sections: SectionData[]; canVote: boolean }) {
  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <div key={s.id} className="space-y-4">
          {s.stageState === "pending" ? (
            <PendingStageCard section={s} />
          ) : (
            <>
              <SectionBallot
                section={s}
                canVote={(s.votable ?? canVote)}
                phaseId={null}
                options={s.options}
                existing={s.existing}
              />
              {s.openPhases.map((p) => (
                <SectionBallot
                  key={p.id}
                  section={s}
                  canVote={true}
                  phaseId={p.id}
                  phaseLabel={p.label}
                  options={s.options.filter((o) => p.optionIds.includes(o.id))}
                  existing={p.existing}
                  methodOverride={p.method}
                  eligibilityOverride={p.eligibility}
                />
              ))}
            </>
          )}
          {s.results && <ResultsView section={s} />}
        </div>
      ))}
    </div>
  );
}

function PendingStageCard({ section }: { section: SectionData }) {
  const { dict } = useI18n();
  return (
    <Card className="opacity-80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4 text-muted-foreground" /> {section.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{dict.vote.stagePending}</p>
      </CardContent>
    </Card>
  );
}

function SectionBallot({
  section,
  canVote,
  phaseId,
  phaseLabel,
  options,
  existing,
  methodOverride,
  eligibilityOverride,
}: {
  section: SectionData;
  canVote: boolean;
  phaseId: string | null;
  phaseLabel?: string;
  options: OptionRef[];
  existing: { optionId: string; rank: number | null; score: number | null }[] | null;
  methodOverride?: string;
  eligibilityOverride?: Eligibility;
}) {
  const router = useRouter();
  const { dict } = useI18n();
  const methodLabel = useMethodLabel();
  // Runoff ballots carry their own method + eligibility; default to the section's.
  const e = eligibilityOverride ?? section.eligibility;
  const method = methodOverride ?? section.method;

  const [set, setSet] = useState<Set<string>>(
    new Set(existing?.filter((x) => x.score == null || method !== "SCORE").map((x) => x.optionId) ?? [])
  );
  const [order, setOrder] = useState<string[]>(
    existing && method === "RANKED"
      ? existing.filter((x) => x.rank != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((x) => x.optionId)
      : []
  );
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries((existing ?? []).filter((x) => x.score != null).map((x) => [x.optionId, x.score as number]))
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">(existing ? "saved" : "idle");
  const [error, setError] = useState<string | null>(null);

  if (!e || !e.canVote) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{section.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{dict.vote.notEligible}</p>
        </CardContent>
      </Card>
    );
  }

  const explanation = explainEligibility(dict, method, e, section.drivingGroup);

  const max = e.maxSelections;
  const disabled = new Set(e.disabledOptionIds);

  function toggle(id: string) {
    if (method === "SINGLE") {
      setSet(new Set([id]));
    } else if (method === "RANKED") {
      setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
    } else {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else {
          if (max != null && next.size >= max) return next; // enforce cap live
          next.add(id);
        }
        return next;
      });
    }
    setStatus("idle");
  }

  const selectedCount = method === "RANKED" ? order.length : method === "SCORE" ? Object.keys(scores).length : set.size;

  function buildSelections() {
    if (method === "RANKED") return order.map((optionId, i) => ({ optionId, rank: i + 1 }));
    if (method === "SCORE")
      return Object.entries(scores).map(([optionId, score]) => ({ optionId, score }));
    return [...set].map((optionId) => ({ optionId }));
  }

  async function submit() {
    setError(null);
    setStatus("saving");
    try {
      await api("/api/vote", {
        method: "POST",
        body: { sectionId: section.id, phaseId, selections: buildSelections() },
      });
      setStatus("saved");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  const overLimit = max != null && selectedCount > max;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {phaseLabel ? `${phaseLabel}` : section.title}
          </CardTitle>
          <Badge tone="primary">{methodLabel(method)}</Badge>
        </div>
        {section.description && !phaseLabel && <p className="text-sm text-muted-foreground">{section.description}</p>}
        <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">{explanation}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {options
            .filter((o) => e.visibleOptionIds.includes(o.id))
            .map((o) => {
              const isDisabled = disabled.has(o.id);
              const rankIdx = order.indexOf(o.id);
              const selected = method === "RANKED" ? rankIdx >= 0 : method === "SCORE" ? false : set.has(o.id);
              return (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    selected && "border-primary bg-accent/50",
                    isDisabled && "opacity-50"
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium">{o.label}</div>
                    {o.description && <div className="truncate text-xs text-muted-foreground">{o.description}</div>}
                  </div>
                  {method === "SCORE" ? (
                    <input
                      type="number"
                      min={e.scoreMin}
                      max={e.scoreMax}
                      disabled={!canVote || isDisabled}
                      value={scores[o.id] ?? ""}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        setScores((s) => {
                          const next = { ...s };
                          if (v === "") delete next[o.id];
                          else next[o.id] = Number(v);
                          return next;
                        });
                        setStatus("idle");
                      }}
                      className="h-9 w-20 rounded-md border px-2 text-sm"
                    />
                  ) : method === "RANKED" ? (
                    <button
                      disabled={!canVote || isDisabled}
                      onClick={() => toggle(o.id)}
                      className={cn(
                        "flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-sm font-semibold",
                        rankIdx >= 0 ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {rankIdx >= 0 ? rankIdx + 1 : "+"}
                    </button>
                  ) : (
                    <input
                      type={method === "SINGLE" ? "radio" : "checkbox"}
                      name={`sec-${section.id}-${phaseId ?? "main"}`}
                      checked={selected}
                      disabled={!canVote || isDisabled || (!selected && max != null && set.size >= max && method !== "SINGLE")}
                      onChange={() => toggle(o.id)}
                      className="h-5 w-5"
                    />
                  )}
                </div>
              );
            })}
        </div>

        <div className="flex items-center justify-between">
          <span className={cn("text-sm", overLimit ? "text-destructive" : "text-muted-foreground")}>
            {dict.vote.selectedOf(selectedCount, max)}
            {e.minSelections > 0 ? dict.vote.minNote(e.minSelections) : ""}
          </span>
          <div className="flex items-center gap-2">
            {status === "saved" && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                <CircleCheck className="size-4" />
                {dict.vote.saved}
              </span>
            )}
            {canVote && (
              <Button onClick={submit} disabled={status === "saving" || overLimit}>
                {status === "saving" ? dict.vote.saving : existing ? dict.vote.update : dict.vote.submit}
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!canVote && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {phaseId === null && section.runoffLocked && <Lock className="size-3.5" />}
            {phaseId === null && section.runoffLocked ? dict.vote.originalLocked : dict.vote.votingClosed}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ResultsView({ section }: { section: SectionData }) {
  const { dict } = useI18n();
  const r = section.results;
  const labelOf = (id: string) => section.options.find((o) => o.id === id)?.label ?? id;
  const max = Math.max(1, ...r.options.map((o: any) => (section.method === "SCORE" ? o.averageScore : o.weightedVotes)));
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">
          {dict.vote.results} {section.title}
        </CardTitle>
        {section.turnout && (
          <p className="text-xs text-muted-foreground">
            {dict.vote.votedTurnout(section.turnout.ballotsCast, section.turnout.eligibleVoters, section.turnout.turnout)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {r.tie && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0" />
            {dict.vote.tieForSlot(r.tiedForLastSeat.map(labelOf).join(", "))}
          </div>
        )}
        {r.options.map((o: any) => {
          const value = section.method === "SCORE" ? o.averageScore : o.weightedVotes;
          const win = r.winners.includes(o.optionId);
          return (
            <div key={o.optionId} className="text-sm">
              <div className="mb-0.5 flex justify-between">
                <span className={cn("inline-flex items-center gap-1.5", win && "font-semibold")}>
                  {win && <Trophy className="size-3.5 text-amber-500" />}
                  {o.label}
                </span>
                <span className="text-muted-foreground">
                  {section.method === "SCORE" ? `avg ${o.averageScore}` : o.weightedVotes}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", win ? "bg-primary" : "bg-primary/40")} style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">{r.explanation}</p>
      </CardContent>
    </Card>
  );
}
