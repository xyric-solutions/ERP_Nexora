"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

const ActionFeedbackContext = createContext<((message: string) => void) | null>(null);

/** Delegates confirmed API outcomes to the existing shell notification stack. */
export function ActionFeedbackProvider({
  onSuccess,
  children,
}: {
  onSuccess: (message: string) => void;
  children: ReactNode;
}) {
  return <ActionFeedbackContext.Provider value={onSuccess}>{children}</ActionFeedbackContext.Provider>;
}

export function useActionFeedback() {
  const notify = useContext(ActionFeedbackContext);
  return useCallback((message: string) => notify?.(message), [notify]);
}
