"use client";
import { Badge } from "@/components/ui";
import { useI18n } from "@/components/providers";

const statusTone: Record<string, "gray" | "blue" | "green" | "amber" | "red" | "primary"> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  OPEN: "green",
  CLOSED: "amber",
  NEEDS_TIEBREAK: "red",
  FINALIZED: "primary",
  ARCHIVED: "gray",
};

export function LocalizedStatus({ status }: { status: string }) {
  const { dict } = useI18n();
  const label = (dict.status as Record<string, string>)[status] ?? status.replace(/_/g, " ");
  return <Badge tone={statusTone[status] ?? "gray"}>{label}</Badge>;
}

export function MethodBadge({ method, tone = "primary" }: { method: string; tone?: "primary" | "gray" }) {
  const { dict } = useI18n();
  const label = (dict.methods as Record<string, string>)[method] ?? method;
  return <Badge tone={tone}>{label}</Badge>;
}

export function useMethodLabel() {
  const { dict } = useI18n();
  return (method: string) => (dict.methods as Record<string, string>)[method] ?? method;
}
