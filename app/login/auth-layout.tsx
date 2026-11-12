"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { Label } from "../components/ui/label";
import { NexoraMark } from "../shared/ui/nexora-mark";
import { application } from "../shared/constants/application";

/** Shared by the sign-in and organisation sign-up pages. */
export const fieldClass =
  "h-11 rounded-[10px] border-border bg-[var(--nx-surface-soft)] px-3.5 text-[15px]! placeholder:text-[var(--nx-text-subtle)] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15";
export const primaryButtonClass = "h-11 w-full rounded-full text-[15px]! font-semibold!";

/** Split sign-in layout: brand panel on the left, the current step on the right (stacked on narrow screens). */
export function AuthLayout({
  brand,
  wide = false,
  children,
}: {
  brand: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] bg-[var(--nx-canvas)] text-foreground min-[960px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="relative flex flex-col gap-6 overflow-hidden px-6 py-5 min-[960px]:h-svh min-[960px]:px-12 min-[960px]:py-8">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-[100px] -bottom-[120px] size-[440px] bg-primary opacity-[.06] [clip-path:polygon(0_100%,0_0,22%_0,78%_62%,78%_0,100%_0,100%_100%,78%_100%,22%_38%,22%_100%)]"
        />
        <div className="relative flex items-center gap-3">
          <NexoraMark className="size-9 shrink-0 text-primary" />
          <div>
            <b className="block text-base font-bold">{application.name}</b>
            <span className="text-[13px] text-muted-foreground">Enterprise operations</span>
          </div>
        </div>
        <div className="relative hidden flex-1 flex-col justify-center gap-8 min-[960px]:flex">{brand}</div>
      </aside>
      <main className="flex flex-col gap-6 px-6 py-5 min-[960px]:h-svh min-[960px]:px-12 min-[960px]:py-8">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[.14em] text-[var(--nx-success)] uppercase">
          <i className="size-2 rounded-full bg-[var(--nx-success)]" aria-hidden="true" />
          Secure workspace
        </span>
        <div
          className={`mx-auto flex w-full flex-1 flex-col justify-center ${wide ? "max-w-[420px]" : "max-w-[380px]"}`}
        >
          {children}
        </div>
        <footer className="flex items-center gap-2 text-xs leading-snug text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-[var(--nx-success)]" aria-hidden="true" />
          <span>
            © {new Date().getFullYear()} Nexora · Protected by server-side sessions and company-scoped access.
          </span>
        </footer>
      </main>
    </div>
  );
}

export function BrandPitch({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-[480px]">
      <h2 className="mb-3 text-[clamp(24px,2.4vw,32px)] leading-[1.15] font-bold tracking-[-.025em]">{title}</h2>
      <p className="m-0 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

export function Title({
  id,
  className = "mb-1.5",
  headingRef,
  children,
}: {
  id: string;
  className?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <h1
      id={id}
      ref={headingRef}
      tabIndex={headingRef ? -1 : undefined}
      className={`${className} text-[28px] leading-tight font-bold tracking-[-.02em] text-[var(--nx-text-strong)] outline-none`}
    >
      {children}
    </h1>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-2 text-sm font-medium">
      {children}
    </Label>
  );
}

export function LoginError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2 text-sm text-[var(--nx-warning)]"
    >
      {message}
    </p>
  );
}
