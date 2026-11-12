"use client";

import {
  createContext,
  useContext,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** The HR & Payroll section a drawer belongs to, shown at the top of every drawer header. */
const SectionContext = createContext<string | null>(null);
/** The bottom action area of the drawer currently rendering its body. */
const FooterContext = createContext<HTMLElement | null>(null);

export function HrDrawerSectionProvider({ section, children }: { section: string; children: ReactNode }) {
  return <SectionContext.Provider value={section}>{children}</SectionContext.Provider>;
}

export function useHrDrawerSection(): string | null {
  return useContext(SectionContext);
}

export function HrDrawerFooterProvider({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return <FooterContext.Provider value={target}>{children}</FooterContext.Provider>;
}

/**
 * Drawer actions (Save, Cancel, Submit, Delete, ...). Inside a drawer they render
 * in its standard bottom action area; elsewhere they render in place. Submit
 * buttons keep submitting the form they are declared in.
 */
export function HrDrawerActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  const target = useContext(FooterContext);
  const anchor = useRef<HTMLSpanElement>(null);
  if (!target) return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
  const submitBridge = (event: MouseEvent<HTMLElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.disabled || button.type !== "submit") return;
    // The portal moved the button outside its form, so submit that form explicitly.
    const form = anchor.current?.closest("form");
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
  };
  return (
    <>
      <span ref={anchor} hidden />
      {createPortal(
        <div className="contents" onClickCapture={submitBridge}>
          {children}
        </div>,
        target,
      )}
    </>
  );
}
