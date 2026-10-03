import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        pending: "border-pending-border bg-pending text-pending-foreground",
        success: "border-primary/30 bg-success text-success-foreground",
        danger: "border-destructive/40 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function StatusPill({
  tone,
  children,
  className,
}: VariantProps<typeof pill> & { children: ReactNode; className?: string }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}
