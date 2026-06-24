"use client";
import { useMemo, useState } from "react";
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
  Select,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { FieldLabel, InfoTip } from "@/components/info-tip";
import { Check, X, Plus, ChevronRight, ChevronLeft, ChevronDown, Trash2 } from "lucide-react";

type GroupRef = { id: string; name: string };
type VoterRef = { id: string; name: string; email: string };

type Method = "SINGLE" | "MULTIPLE" | "RANKED" | "SCORE" | "APPROVAL";

interface OptionState {
  label: string;
  description?: string;
  hiddenForGroupIds: string[];
}
interface GroupLimitState {
  groupId: string;
  maxSelections: number | null;
  voteWeight: number;
  canVote: boolean;
}
interface SectionState {
  title: string;
  description: string;
  method: Method;
  minSelections: number | null;
  maxSelections: number | null;
  exactSelections: number | null;
  minRanked: number | null;
  maxRanked: number | null;
  requireFullRank: boolean;
  scoreMin: number;
  scoreMax: number;
  allowSameScore: boolean;
  defaultWeight: number;
  numWinners: number;
  resultVisibility: string;
  anonymity: string;
  allowVoteEdit: boolean;
  conflictStrategy: string;
  tieBreakStrategy: string;
  allowedGroupIds: string[];
  excludedGroupIds: string[];
  advancedRuleText: string;
  options: OptionState[];
  groupLimits: GroupLimitState[];
}

function newSection(): SectionState {
  return {
    title: "",
    description: "",
    method: "MULTIPLE",
    minSelections: 0,
    maxSelections: 3,
    exactSelections: null,
    minRanked: null,
    maxRanked: null,
    requireFullRank: false,
    scoreMin: 0,
    scoreMax: 5,
    allowSameScore: true,
    defaultWeight: 1,
    numWinners: 1,
    resultVisibility: "AFTER_CLOSE",
    anonymity: "ADMIN_VISIBLE",
    allowVoteEdit: true,
    conflictStrategy: "HIGHEST",
    tieBreakStrategy: "MANUAL",
    allowedGroupIds: [],
    excludedGroupIds: [],
    advancedRuleText: "",
    options: [{ label: "", hiddenForGroupIds: [] }, { label: "", hiddenForGroupIds: [] }],
    groupLimits: [],
  };
}

export function PollWizard({ groups, voters }: { groups: GroupRef[]; voters: VoterRef[] }) {
  const router = useRouter();
  const { dict } = useI18n();
  const w = dict.wizard;
  const STEPS = w.steps;
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [sequential, setSequential] = useState(false);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [accessGroupIds, setAccessGroupIds] = useState<string[]>([]);
  const [sections, setSections] = useState<SectionState[]>([newSection()]);

  function updateSection(i: number, patch: Partial<SectionState>) {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  }

  const payload = useMemo(
    () => ({
      title,
      description: description || undefined,
      visibility,
      sequential,
      opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      accessUserIds: [],
      accessGroupIds,
      sections: sections.map((s) => ({
        title: s.title,
        description: s.description || undefined,
        method: s.method,
        minSelections: s.method === "SCORE" || s.method === "RANKED" ? null : s.minSelections,
        maxSelections: s.method === "SINGLE" ? null : s.maxSelections,
        exactSelections: s.exactSelections,
        minRanked: s.minRanked,
        maxRanked: s.maxRanked,
        requireFullRank: s.requireFullRank,
        scoreMin: s.scoreMin,
        scoreMax: s.scoreMax,
        allowSameScore: s.allowSameScore,
        defaultWeight: s.defaultWeight,
        numWinners: s.numWinners,
        resultVisibility: s.resultVisibility,
        anonymity: s.anonymity,
        allowVoteEdit: s.allowVoteEdit,
        conflictStrategy: s.conflictStrategy,
        tieBreakStrategy: s.tieBreakStrategy,
        allowedGroupIds: s.allowedGroupIds,
        excludedGroupIds: s.excludedGroupIds,
        advancedRule: s.advancedRuleText.trim() ? safeParse(s.advancedRuleText) : null,
        options: s.options
          .filter((o) => o.label.trim())
          .map((o) => ({
            label: o.label,
            description: o.description || undefined,
            hiddenForGroupIds: o.hiddenForGroupIds,
            disabledForGroupIds: [],
          })),
        groupLimits: s.groupLimits,
      })),
    }),
    [title, description, visibility, sequential, opensAt, closesAt, accessGroupIds, sections]
  );

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      // Validate advanced JSON locally for a friendly error.
      for (const s of sections) {
        if (s.advancedRuleText.trim() && safeParse(s.advancedRuleText) == null)
          throw new Error(`Section "${s.title}" has invalid advanced JSON.`);
      }
      const { id } = await api<{ id: string }>("/api/polls", { method: "POST", body: payload });
      router.push(`/admin/polls/${id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const canNext =
    step === 0
      ? title.trim().length > 0
      : step === 1
        ? sections.every((s) => s.title.trim() && s.options.filter((o) => o.label.trim()).length >= 1)
        : true;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{w.createPoll}</h1>
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin")}>
          {dict.common.cancel}
        </Button>
      </div>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <ChevronRight className="size-4 text-muted-foreground/60" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{w.basicInfo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{w.title}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Season 4 Championship Vote" />
            </div>
            <div className="space-y-1.5">
              <Label>{w.description}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel label={w.visibility} tip={w.help.visibility} />
                <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                  <option value="PRIVATE">{w.privateRestricted}</option>
                  <option value="PUBLIC">{w.publicShare}</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel label={w.opensAt} tip={w.help.opensAt} />
                <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel label={w.closesAt} tip={w.help.closesAt} />
                <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </div>
            </div>
            {visibility === "PRIVATE" && groups.length > 0 && (
              <div className="space-y-1.5">
                <FieldLabel label={w.restrictGroups} tip={w.help.restrictGroups} />
                <ChipMulti
                  options={groups}
                  selected={accessGroupIds}
                  onToggle={(id) =>
                    setAccessGroupIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
                  }
                />
                <p className="text-xs text-muted-foreground">{w.restrictHint}</p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
              {w.sequential}
              <InfoTip content={w.help.sequential} />
            </label>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <SectionBasics
              key={i}
              index={i}
              section={s}
              onChange={(patch) => updateSection(i, patch)}
              onRemove={sections.length > 1 ? () => setSections((arr) => arr.filter((_, idx) => idx !== i)) : undefined}
            />
          ))}
          <Button variant="outline" onClick={() => setSections((s) => [...s, newSection()])}>
            <Plus />
            {w.addSection}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <SectionRules key={i} section={s} groups={groups} onChange={(patch) => updateSection(i, patch)} />
          ))}
        </div>
      )}

      {step === 3 && <ReviewStep payload={payload} groups={groups} />}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft />
          {dict.common.back}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            {dict.common.next}
            <ChevronRight />
          </Button>
        ) : (
          <Button disabled={busy} onClick={publish}>
            <Check />
            {busy ? w.publishing : w.publish}
          </Button>
        )}
      </div>
    </div>
  );
}

function safeParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ChipMulti({
  options,
  selected,
  onToggle,
}: {
  options: GroupRef[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              on ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {on && <Check className="size-3" />}
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function SectionBasics({
  index,
  section,
  onChange,
  onRemove,
}: {
  index: number;
  section: SectionState;
  onChange: (patch: Partial<SectionState>) => void;
  onRemove?: () => void;
}) {
  const { dict } = useI18n();
  const w = dict.wizard;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          {w.section} {index + 1}
        </CardTitle>
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 />
            {dict.common.remove}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{w.title}</Label>
            <Input value={section.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Tracks" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel label={w.votingMethod} tip={w.help.votingMethod} />
            <Select value={section.method} onChange={(e) => onChange({ method: e.target.value as Method })}>
              <option value="SINGLE">{dict.methods.SINGLE}</option>
              <option value="MULTIPLE">{dict.methods.MULTIPLE}</option>
              <option value="RANKED">{dict.methods.RANKED}</option>
              <option value="SCORE">{dict.methods.SCORE}</option>
              <option value="APPROVAL">{dict.methods.APPROVAL}</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{w.description}</Label>
          <Textarea value={section.description} onChange={(e) => onChange({ description: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{w.options}</Label>
          {section.options.map((o, j) => (
            <div key={j} className="flex gap-2">
              <Input
                value={o.label}
                onChange={(e) =>
                  onChange({ options: section.options.map((x, idx) => (idx === j ? { ...x, label: e.target.value } : x)) })
                }
                placeholder={`${w.option} ${j + 1}`}
              />
              {section.options.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={dict.common.remove}
                  onClick={() => onChange({ options: section.options.filter((_, idx) => idx !== j) })}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ options: [...section.options, { label: "", hiddenForGroupIds: [] }] })}
          >
            <Plus />
            {w.addOption}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionRules({
  section,
  groups,
  onChange,
}: {
  section: SectionState;
  groups: GroupRef[];
  onChange: (patch: Partial<SectionState>) => void;
}) {
  const { dict } = useI18n();
  const w = dict.wizard;
  const [showAdvanced, setShowAdvanced] = useState(Boolean(section.advancedRuleText));
  const advancedValid = !section.advancedRuleText.trim() || safeParse(section.advancedRuleText) != null;

  function setGroupLimit(groupId: string, patch: Partial<GroupLimitState>) {
    const existing = section.groupLimits.find((l) => l.groupId === groupId);
    const next = existing
      ? section.groupLimits.map((l) => (l.groupId === groupId ? { ...l, ...patch } : l))
      : [...section.groupLimits, { groupId, maxSelections: null, voteWeight: 1, canVote: true, ...patch }];
    onChange({ groupLimits: next });
  }

  const numberInput = (value: number | null, on: (v: number | null) => void) => (
    <Input
      type="number"
      className="h-8 w-20"
      value={value ?? ""}
      onChange={(e) => on(e.target.value === "" ? null : Number(e.target.value))}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {section.title || w.untitled} {w.rulesSuffix}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {w.method}: {(dict.methods as Record<string, string>)[section.method]}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {(section.method === "MULTIPLE" || section.method === "APPROVAL") && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FieldLabel label={w.minSelections} tip={w.help.minSelections} />
              {numberInput(section.minSelections, (v) => onChange({ minSelections: v }))}
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={w.maxSelections} tip={w.help.maxSelections} />
              {numberInput(section.maxSelections, (v) => onChange({ maxSelections: v }))}
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={w.exact} tip={w.help.exact} />
              {numberInput(section.exactSelections, (v) => onChange({ exactSelections: v }))}
            </div>
          </div>
        )}
        {section.method === "RANKED" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FieldLabel label={w.minRanked} tip={w.help.minRanked} />
              {numberInput(section.minRanked, (v) => onChange({ minRanked: v }))}
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={w.maxRanked} tip={w.help.maxRanked} />
              {numberInput(section.maxRanked, (v) => onChange({ maxRanked: v }))}
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={section.requireFullRank}
                onChange={(e) => onChange({ requireFullRank: e.target.checked })}
              />
              {w.requireFullRank}
              <InfoTip content={w.help.requireFullRank} />
            </label>
          </div>
        )}
        {section.method === "SCORE" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FieldLabel label={w.minScore} tip={w.help.minScore} />
              {numberInput(section.scoreMin, (v) => onChange({ scoreMin: v ?? 0 }))}
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={w.maxScore} tip={w.help.maxScore} />
              {numberInput(section.scoreMax, (v) => onChange({ scoreMax: v ?? 5 }))}
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={section.allowSameScore}
                onChange={(e) => onChange({ allowSameScore: e.target.checked })}
              />
              {w.allowSameScore}
              <InfoTip content={w.help.allowSameScore} />
            </label>
          </div>
        )}

        {/* Per-group limits */}
        {groups.length > 0 && (
          <div className="space-y-2">
            <FieldLabel label={w.perGroupLimits} tip={w.help.perGroupLimits} />
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{w.group}</th>
                    <th className="px-3 py-2">{w.maxSelections}</th>
                    <th className="px-3 py-2">{w.voteWeight}</th>
                    <th className="px-3 py-2">{w.canVote}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const lim = section.groupLimits.find((l) => l.groupId === g.id);
                    return (
                      <tr key={g.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{g.name}</td>
                        <td className="px-3 py-2">
                          {numberInput(lim?.maxSelections ?? null, (v) => setGroupLimit(g.id, { maxSelections: v }))}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="h-8 w-20"
                            min={1}
                            value={lim?.voteWeight ?? 1}
                            onChange={(e) => setGroupLimit(g.id, { voteWeight: Number(e.target.value) || 1 })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={lim?.canVote ?? true}
                            onChange={(e) => setGroupLimit(g.id, { canVote: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{w.perGroupHint}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel label={w.conflictStrategy} tip={w.help.conflict} />
            <Select value={section.conflictStrategy} onChange={(e) => onChange({ conflictStrategy: e.target.value })}>
              <option value="HIGHEST">{w.conflict.HIGHEST}</option>
              <option value="LOWEST">{w.conflict.LOWEST}</option>
              <option value="PRIORITY">{w.conflict.PRIORITY}</option>
              <option value="OVERRIDE">{w.conflict.OVERRIDE}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel label={w.tieBreaker} tip={w.help.tieBreaker} />
            <Select value={section.tieBreakStrategy} onChange={(e) => onChange({ tieBreakStrategy: e.target.value })}>
              <option value="MANUAL">{w.tie.MANUAL}</option>
              <option value="RUNOFF">{w.tie.RUNOFF}</option>
              <option value="INSTANT_RUNOFF">{w.tie.INSTANT_RUNOFF}</option>
              <option value="MOST_FIRST_PLACE">{w.tie.MOST_FIRST_PLACE}</option>
              <option value="MOST_APPROVALS">{w.tie.MOST_APPROVALS}</option>
              <option value="PREVIOUS_ROUND">{w.tie.PREVIOUS_ROUND}</option>
              <option value="RANDOM_SEED">{w.tie.RANDOM_SEED}</option>
              <option value="KEEP_TIE">{w.tie.KEEP_TIE}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel label={w.resultVisibility} tip={w.help.resultVisibility} />
            <Select value={section.resultVisibility} onChange={(e) => onChange({ resultVisibility: e.target.value })}>
              <option value="ALWAYS">{w.visOption.ALWAYS}</option>
              <option value="AFTER_VOTE">{w.visOption.AFTER_VOTE}</option>
              <option value="AFTER_CLOSE">{w.visOption.AFTER_CLOSE}</option>
              <option value="ADMIN_ONLY">{w.visOption.ADMIN_ONLY}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel label={w.anonymity} tip={w.help.anonymity} />
            <Select value={section.anonymity} onChange={(e) => onChange({ anonymity: e.target.value })}>
              <option value="ANONYMOUS">{w.anon.ANONYMOUS}</option>
              <option value="ADMIN_VISIBLE">{w.anon.ADMIN_VISIBLE}</option>
              <option value="PUBLIC">{w.anon.PUBLIC}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel label={w.winners} tip={w.help.winners} />
            <Input type="number" min={1} value={section.numWinners} onChange={(e) => onChange({ numWinners: Number(e.target.value) || 1 })} />
          </div>
          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={section.allowVoteEdit} onChange={(e) => onChange({ allowVoteEdit: e.target.checked })} />
            {w.allowEdit}
            <InfoTip content={w.help.allowEdit} />
          </label>
        </div>

        {/* Eligibility */}
        {groups.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel label={w.onlyGroups} tip={w.help.onlyGroups} />
              <ChipMulti
                options={groups}
                selected={section.allowedGroupIds}
                onToggle={(id) =>
                  onChange({
                    allowedGroupIds: section.allowedGroupIds.includes(id)
                      ? section.allowedGroupIds.filter((x) => x !== id)
                      : [...section.allowedGroupIds, id],
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel label={w.excludeGroups} tip={w.help.excludeGroups} />
              <ChipMulti
                options={groups}
                selected={section.excludedGroupIds}
                onToggle={(id) =>
                  onChange({
                    excludedGroupIds: section.excludedGroupIds.includes(id)
                      ? section.excludedGroupIds.filter((x) => x !== id)
                      : [...section.excludedGroupIds, id],
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Option eligibility (hide options per group) */}
        {groups.length > 0 && section.options.some((o) => o.label.trim()) && (
          <div className="space-y-2">
            <FieldLabel label={w.hideOptions} tip={w.help.hideOptions} />
            {section.options.filter((o) => o.label.trim()).map((o, j) => (
              <div key={j} className="flex flex-wrap items-center gap-2">
                <span className="w-28 truncate text-sm">{o.label}</span>
                <ChipMulti
                  options={groups}
                  selected={o.hiddenForGroupIds}
                  onToggle={(id) => {
                    const opts = section.options.map((x) =>
                      x === o
                        ? {
                            ...x,
                            hiddenForGroupIds: x.hiddenForGroupIds.includes(id)
                              ? x.hiddenForGroupIds.filter((g) => g !== id)
                              : [...x.hiddenForGroupIds, id],
                          }
                        : x
                    );
                    onChange({ options: opts });
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Advanced JSON */}
        <div className="space-y-2">
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <ChevronDown className={cn("size-4 transition-transform", showAdvanced ? "" : "-rotate-90")} />
              {showAdvanced ? w.advancedHide : w.advancedShow}
            </button>
            <InfoTip content={w.help.advanced} />
          </span>
          {showAdvanced && (
            <div className="space-y-1.5">
              <Textarea
                className="font-mono text-xs"
                rows={6}
                value={section.advancedRuleText}
                onChange={(e) => onChange({ advancedRuleText: e.target.value })}
                placeholder={'{\n  "rules": [\n    { "when": { "hasGroup": "Steward" }, "then": { "voteWeight": 2 } }\n  ]\n}'}
              />
              {!advancedValid && <p className="text-xs text-destructive">{w.advancedInvalid}</p>}
              <p className="text-xs text-muted-foreground">{w.advancedHelp}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStep({ payload, groups }: { payload: any; groups: GroupRef[] }) {
  const { dict } = useI18n();
  const w = dict.wizard;
  const gname = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{w.review}</CardTitle>
        <p className="text-sm text-muted-foreground">{w.reviewSubtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold">{payload.title}</h3>
          <div className="mt-1 flex gap-2">
            <Badge tone="blue">{payload.visibility}</Badge>
            <Badge tone="gray">
              {payload.sections.length} {w.sectionsCount}
            </Badge>
          </div>
        </div>
        {payload.sections.map((s: any, i: number) => (
          <div key={i} className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              {s.title} <Badge tone="primary">{(dict.methods as Record<string, string>)[s.method] ?? s.method}</Badge>
            </div>
            <p className="text-muted-foreground">
              {s.options.length} {w.optionsCount}
            </p>
            {s.groupLimits.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {s.groupLimits.map((l: any) => (
                  <li key={l.groupId}>
                    {gname(l.groupId)}: {dict.common.max} {l.maxSelections ?? dict.common.none.toLowerCase()},{" "}
                    {w.voteWeight.toLowerCase()} {l.voteWeight}
                    {l.canVote ? "" : `, ${w.cannotVote}`}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-muted-foreground">
              {w.tieBreaker}: {(w.tie as Record<string, string>)[s.tieBreakStrategy] ?? s.tieBreakStrategy}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
