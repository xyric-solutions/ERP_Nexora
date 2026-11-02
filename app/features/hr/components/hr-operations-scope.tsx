"use client";
import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from "react";

export type HrOperationsScope = { company_id: string; as_of?: string; on_date?: string; month?: string };
export const HrOperationsScopeContext = createContext<Dispatch<SetStateAction<HrOperationsScope | null>> | null>(null);

export function readHrOperationsScope(reference?: string): Partial<HrOperationsScope> {
  try {
    const value = JSON.parse(reference ?? "null");
    if (!value || typeof value !== "object") return {};
    const date = typeof value.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.as_of) ? value.as_of : undefined;
    const month = typeof value.month === "string" && /^\d{4}-\d{2}-01$/.test(value.month) ? value.month : undefined;
    return { company_id: typeof value.company_id === "string" ? value.company_id : undefined, as_of: date, month };
  } catch {
    return {};
  }
}

export function useHrOperationsScope(company: string, date?: string, month?: string) {
  const publish = useContext(HrOperationsScopeContext);
  useEffect(() => {
    if (company) publish?.({ company_id: company, as_of: date, on_date: date, month });
  }, [publish, company, date, month]);
}
