"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
  LinkButton,
  Select,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { LocalizedStatus, useMethodLabel } from "@/components/localized";
import {
  Trophy,
  TriangleAlert,
  Eye,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  Archive,
  ChevronRight,
  Link as LinkIcon,
  Ticket,
  Layers,
  BarChart3,
  Users,
  GitBranch,
  ScrollText,
} from "lucide-react";

export function PollDetail({ poll, results, shareUrl }: { poll: any; results: any[]; shareUrl: string }) {
  const router = useRouter();
  const { dict } = useI18n();
  const d = dict.detail;
  const TABS = d.tabs;
  const [tab, setTab] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: string) {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/polls/${poll.id}/status`, { method: "POST", body: { status } });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lifecycle: Record<string, { label: string; status: string; variant?: any; icon: any }[]> = {
    DRAFT: [{ label: d.openPoll, status: "OPEN", icon: Play }],
    SCHEDULED: [{ label: d.openNow, status: "OPEN", icon: Play }],
    OPEN: [{ label: d.closePoll, status: "CLOSED", variant: "outline", icon: Square }],
    CLOSED: [
      { label: d.reopen, status: "OPEN", variant: "outline", icon: RotateCcw },
      { label: d.finalize, status: "FINALIZED", icon: CheckCircle2 },
    ],
    NEEDS_TIEBREAK: [{ label: d.finalize, status: "FINALIZED", icon: CheckCircle2 }],
    FINALIZED: [{ label: d.archive, status: "ARCHIVED", variant: "outline", icon: Archive }],
    ARCHIVED: [],
  };
  const tabIcons = [BarChart3, Users, GitBranch, ScrollText];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{poll.title}</h1>
            <LocalizedStatus status={poll.status} />
            {poll.sequential && <Badge tone="blue">{d.sequentialBadge}</Badge>}
          </div>
          {poll.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{poll.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {poll.visibility} · {d.opens} {formatDate(poll.opensAt)} · {d.closes} {formatDate(poll.closesAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={`/p/${poll.slug}?preview=1`} variant="outline" size="sm">
            <Eye />
            {d.previewAsVoter}
          </LinkButton>
          {(lifecycle[poll.status] ?? []).map((a) => {
            const Icon = a.icon;
            return (
              <Button key={a.label} size="sm" variant={a.variant} disabled={busy} onClick={() => setStatus(a.status)}>
                <Icon />
                {a.label}
              </Button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {poll.sequential && <StageBar poll={poll} results={results} />}

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t, i) => {
          const Icon = tabIcons[i];
          return (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === i
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t}
            </button>
          );
        })}
      </div>

      {tab === 0 && <ResultsTab poll={poll} results={results} />}
      {tab === 1 && <VotersTab poll={poll} shareUrl={shareUrl} />}
      {tab === 2 && <TieBreakTab poll={poll} results={results} onDone={() => router.refresh()} />}
      {tab === 3 && <AuditTab logs={poll.auditLogs} />}
    </div>
  );
}

function StageBar({ poll, results }: { poll: any; results: any[] }) {
  const router = useRouter();
  const { dict } = useI18n();
  const d = dict.detail;
  const [advancing, setAdvancing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = advancing || reopening;

  const sections: any[] = [...poll.sections].sort((a, b) => a.position - b.position);
  const total = sections.length;
  const cur = poll.currentStage;
  const allDone = cur >= total || poll.status !== "OPEN";
  const canReopen = (poll.status === "OPEN" && cur > 0) || (poll.status === "CLOSED" && cur > total - 1);

  // Is the current stage blocked by an unresolved tie / open runoff?
  const currentSection = sections.find((s) => s.position === cur);
  let blocked = false;
  if (currentSection && poll.status === "OPEN") {
    const r = results.find((x) => x.sectionId === currentSection.id);
    const phases = r?.phases ?? [];
    const openPhase = phases.some((p: any) => p.phase.status === "OPEN");
    const latest = phases.length ? phases[phases.length - 1] : null;
    const tie = openPhase ? true : latest ? latest.computed?.result?.tie : r?.original?.result?.tie;
    blocked = Boolean(tie) && currentSection.tieBreakStrategy !== "KEEP_TIE";
  }

  async function advance() {
    setAdvancing(true);
    setError(null);
    try {
      await api(`/api/polls/${poll.id}/advance-stage`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdvancing(false);
    }
  }

  async function reopen() {
    if (!confirm(d.reopenConfirm)) return;
    setReopening(true);
    setError(null);
    try {
      await api(`/api/polls/${poll.id}/reopen-stage`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReopening(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-muted-foreground" />
          {d.stagesTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-1.5">
          {sections.map((s, i) => {
            const state =
              s.position < cur ? "done" : s.position === cur && poll.status === "OPEN" ? "active" : "pending";
            const tag =
              state === "active"
                ? { label: d.stageActiveTag, tone: "green" as const }
                : state === "done"
                  ? { label: d.stageDoneTag, tone: "gray" as const }
                  : { label: d.stagePendingTag, tone: "blue" as const };
            return (
              <li key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {s.title}
                </span>
                <Badge tone={tag.tone}>{tag.label}</Badge>
              </li>
            );
          })}
        </ol>

        {allDone && cur >= total && <p className="text-sm text-muted-foreground">{d.allStagesDone}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {!allDone && currentSection && (
            <Button onClick={advance} disabled={busy || blocked}>
              {advancing ? d.advancing : cur >= total - 1 ? d.advanceLast : d.advanceStage}
              <ChevronRight />
            </Button>
          )}
          {canReopen && (
            <Button variant="outline" onClick={reopen} disabled={busy}>
              <RotateCcw />
              {reopening ? d.reopening : d.reopenStage}
            </Button>
          )}
        </div>
        {blocked && !allDone && <p className="text-sm text-amber-700">{d.stageBlocked}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function ResultsTab({ poll, results }: { poll: any; results: any[] }) {
  return (
    <div className="space-y-6">
      {poll.sections.map((s: any) => {
        const r = results.find((x) => x.sectionId === s.id);
        return <SectionResult key={s.id} section={s} data={r} />;
      })}
    </div>
  );
}

function SectionResult({ section, data }: { section: any; data: any }) {
  const { dict } = useI18n();
  const d = dict.detail;
  const methodLabel = useMethodLabel();
  const c = data?.original;
  if (!c) return null;
  const labelOf = (id: string) => section.options.find((o: any) => o.id === id)?.label ?? id;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{section.title}</CardTitle>
          <Badge tone="primary">{methodLabel(section.method)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {d.votedOf(c.ballotsCast, c.eligibleVoters)} · {d.turnout} {c.turnout}%
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.result.tie && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {d.tieDetected(c.result.tiedForLastSeat.map(labelOf).join(", "))} {d.resolveInTab}
            </span>
          </div>
        )}

        <ResultTable result={c.result} method={section.method} />

        <p className="text-sm">
          <span className="font-medium">{d.outcome} </span>
          {c.result.winners.length ? c.result.winners.map(labelOf).join(", ") : "—"}
        </p>
        <p className="text-xs text-muted-foreground">{c.result.explanation}</p>

        {section.method === "RANKED" && c.result.rounds && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{d.roundByRound}</summary>
            <div className="mt-2 space-y-2">
              {c.result.rounds.map((round: any) => (
                <div key={round.round}>
                  <div className="font-medium">
                    {d.round} {round.round}
                  </div>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {round.tallies
                      .sort((a: any, b: any) => b.votes - a.votes)
                      .map((t: any) => (
                        <li key={t.optionId}>
                          {t.label}: {t.votes}
                          {round.eliminated.includes(t.optionId) ? ` — ${d.eliminated}` : ""}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        {data.phases?.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <h4 className="text-sm font-semibold">{d.tieBreakPhases}</h4>
            {data.phases.map((p: any) => (
              <RunoffPhaseCard
                key={p.phase.id}
                phase={p.phase}
                computed={p.computed}
                method={p.phase.method ?? section.method}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunoffPhaseCard({ phase, computed, method }: { phase: any; computed: any; method: string }) {
  const router = useRouter();
  const { dict } = useI18n();
  const d = dict.detail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (!confirm(d.closeRunoffConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/phases/${phase.id}/close`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{phase.label}</span>
        <div className="flex items-center gap-2">
          <LocalizedStatus status={phase.status} />
          {phase.status === "OPEN" && (
            <Button size="sm" variant="outline" onClick={close} disabled={busy}>
              <Square />
              {busy ? d.closing : d.closeRunoff}
            </Button>
          )}
        </div>
      </div>
      {computed && <ResultTable result={computed.result} method={method} compact />}
      {computed && <p className="mt-1 text-xs text-muted-foreground">{computed.result.explanation}</p>}
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ResultTable({ result, method, compact }: { result: any; method: string; compact?: boolean }) {
  const max = Math.max(1, ...result.options.map((o: any) => (method === "SCORE" ? o.averageScore : o.weightedVotes)));
  return (
    <div className="space-y-1.5">
      {result.options.map((o: any) => {
        const value = method === "SCORE" ? o.averageScore : o.weightedVotes;
        const isWinner = result.winners.includes(o.optionId);
        return (
          <div key={o.optionId} className="text-sm">
            <div className="mb-0.5 flex items-center justify-between">
              <span className={cn("inline-flex items-center gap-1.5", isWinner && "font-semibold")}>
                {isWinner && <Trophy className="size-3.5 text-amber-500" />}
                {o.label}
              </span>
              <span className="text-muted-foreground">
                {method === "SCORE"
                  ? `avg ${o.averageScore} (${o.scoreCount} scores, total ${o.totalScore})`
                  : `${o.weightedVotes}${o.rawVotes !== o.weightedVotes ? ` (raw ${o.rawVotes})` : ""}`}
              </span>
            </div>
            {!compact && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${isWinner ? "bg-primary" : "bg-primary/40"}`}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VotersTab({ poll, shareUrl }: { poll: any; shareUrl: string }) {
  const { dict } = useI18n();
  const d = dict.detail;
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(5);

  async function makeInvite() {
    setBusy(true);
    try {
      const { invite } = await api<{ invite: { url: string } }>("/api/invites", {
        method: "POST",
        body: { pollId: poll.id, role: "VOTER", maxUses: 100 },
      });
      setInviteUrl(invite.url);
    } finally {
      setBusy(false);
    }
  }
  async function makeCodes() {
    setBusy(true);
    try {
      const { codes } = await api<{ codes: string[] }>("/api/codes", {
        method: "POST",
        body: { pollId: poll.id, count },
      });
      setCodes(codes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {poll.visibility === "PUBLIC" && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{d.publicShareLink}</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded bg-muted px-3 py-2 text-sm">{shareUrl}</code>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{d.inviteLink}</CardTitle>
          <p className="text-sm text-muted-foreground">{d.inviteHint}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={makeInvite} disabled={busy}>
            <LinkIcon />
            {d.generateInvite}
          </Button>
          {inviteUrl && <code className="block break-all rounded bg-muted px-3 py-2 text-sm">{inviteUrl}</code>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{d.oneTimeCodes}</CardTitle>
          <p className="text-sm text-muted-foreground">{d.shownOnce}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="w-24" />
            <Button onClick={makeCodes} disabled={busy}>
              <Ticket />
              {d.generateCodes}
            </Button>
          </div>
          {codes && (
            <div className="grid grid-cols-2 gap-1 rounded bg-muted p-2 font-mono text-sm">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>{d.accessList}</CardTitle>
        </CardHeader>
        <CardContent>
          {poll.access.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {poll.visibility === "PRIVATE" ? d.noRestrictions : d.publicPoll}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {poll.access.map((a: any) => (
                <li key={a.id}>
                  <Badge tone="blue">{a.group?.name ?? a.user?.name ?? "?"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TieBreakTab({ poll, results, onDone }: { poll: any; results: any[]; onDone: () => void }) {
  const { dict } = useI18n();
  const d = dict.detail;
  const tied = poll.sections
    .map((s: any) => {
      const r = results.find((x) => x.sectionId === s.id);
      const tiedIds: string[] = r?.original?.result?.tiedForLastSeat ?? [];
      const lockedWinners: number = r?.original?.result?.winners?.length ?? 0;
      const seats = Math.max(1, (s.numWinners ?? 1) - lockedWinners);
      return { section: s, tiedIds, rec: r?.original?.tieRecommendation, seats };
    })
    .filter((x: any) => x.tiedIds.length > 0);

  if (tied.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{d.noTies}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tied.map((t: any) => (
        <RunoffCreator key={t.section.id} section={t.section} tiedIds={t.tiedIds} rec={t.rec} seats={t.seats} onDone={onDone} />
      ))}
    </div>
  );
}

function RunoffCreator({
  section,
  tiedIds,
  rec,
  seats,
  onDone,
}: {
  section: any;
  tiedIds: string[];
  rec: any;
  seats: number;
  onDone: () => void;
}) {
  const { dict } = useI18n();
  const d = dict.detail;
  const [selected, setSelected] = useState<string[]>(tiedIds);
  const [method, setMethod] = useState<string>(seats <= 1 ? "SINGLE" : "MULTIPLE");
  const [maxSel, setMaxSel] = useState<number>(seats);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelOf = (id: string) => section.options.find((o: any) => o.id === id)?.label ?? id;
  const tieLabel = (dict.wizard.tie as Record<string, string>)[section.tieBreakStrategy] ?? section.tieBreakStrategy;
  const usesMax = method === "MULTIPLE" || method === "APPROVAL";

  async function createRunoff() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sections/${section.id}/runoff`, {
        method: "POST",
        body: { optionIds: selected, method, ...(usesMax ? { maxSelections: maxSel } : {}) },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {d.configuredStrategy} <Badge tone="amber">{tieLabel}</Badge> · {rec?.note}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-primary">{d.seatsRemaining(seats)}</p>
        <p className="text-sm">{d.tiedSelect}</p>
        <div className="flex flex-wrap gap-2">
          {tiedIds.map((id) => (
            <button
              key={id}
              onClick={() => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              className={`rounded-full border px-3 py-1 text-sm ${
                selected.includes(id) ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              {labelOf(id)}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{d.runoffMethod}</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="SINGLE">{dict.methods.SINGLE}</option>
              <option value="MULTIPLE">{dict.methods.MULTIPLE}</option>
              <option value="RANKED">{dict.methods.RANKED}</option>
              <option value="SCORE">{dict.methods.SCORE}</option>
              <option value="APPROVAL">{dict.methods.APPROVAL}</option>
            </Select>
          </div>
          {usesMax && (
            <div className="space-y-1.5">
              <Label>{d.runoffMax}</Label>
              <Input
                type="number"
                min={1}
                max={Math.max(1, selected.length - 1)}
                value={maxSel}
                onChange={(e) => setMaxSel(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{d.runoffConfigHint}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={createRunoff} disabled={busy || selected.length < 2}>
          <GitBranch />
          {d.createRunoff}
        </Button>
        <p className="text-xs text-muted-foreground">{d.runoffHint}</p>
      </CardContent>
    </Card>
  );
}

function AuditTab({ logs }: { logs: any[] }) {
  const { dict } = useI18n();
  const d = dict.detail;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">{d.auditWhen}</th>
              <th className="px-4 py-2">{d.auditAction}</th>
              <th className="px-4 py-2">{d.auditBy}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{formatDate(l.createdAt)}</td>
                <td className="px-4 py-2">
                  <Badge tone="gray">{l.action.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-4 py-2">{l.actor?.name ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  {d.auditEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
