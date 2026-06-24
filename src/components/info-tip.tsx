"use client";
import { useId, useState } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface TipContent {
  what: string;
  options?: { name: string; desc: string }[];
}

/** A small "i" icon that reveals an accessible tooltip on hover / focus / click. */
export function InfoTip({ content, className }: { content: TipContent; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label="Más información"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-1/2 top-6 z-50 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border bg-card p-3 text-left text-xs font-normal leading-relaxed text-card-foreground shadow-lg"
        >
          <span className="block text-foreground">{content.what}</span>
          {content.options && (
            <span className="mt-2 block space-y-1.5">
              {content.options.map((o) => (
                <span key={o.name} className="block">
                  <span className="font-semibold">{o.name}:</span>{" "}
                  <span className="text-muted-foreground">{o.desc}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** A form label with an optional info tooltip beside it. */
export function FieldLabel({
  label,
  tip,
  htmlFor,
  className,
}: {
  label: string;
  tip?: TipContent;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {tip && <InfoTip content={tip} />}
    </span>
  );
}
