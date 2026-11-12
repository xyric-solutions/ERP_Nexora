/**
 * People who can be chosen as a quotation approver (meeting of 11 Nov 2026:
 * "names of all employees will appear; search and pick one").
 *
 * Prototype directory: active employees from the shared mock HR fixture plus
 * the reviewers that appear in the sales sample records. When the Access &
 * Control page and the Sales API exist, the list must come from the server and
 * be limited to people with approval rights on the Sales module.
 */

import { employees } from "@/shared/fixtures/mock-data";

export interface ApproverOption {
  name: string;
  /** Job title, recorded as the role an approval was given in. */
  title: string;
}

const SAMPLE_REVIEWERS: readonly ApproverOption[] = [
  { name: "Imran Sheikh", title: "CEO" },
  { name: "Farah Khan", title: "Sales Manager" },
];

/** Searchable approver list. The signed-in user is listed first so a prototype user can test both sides. */
export function approverDirectory(actor: string): ApproverOption[] {
  const seen = new Set<string>();
  const options: ApproverOption[] = [];
  const add = (option: ApproverOption) => {
    const key = option.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push(option);
  };
  add({ name: actor, title: "You" });
  for (const reviewer of SAMPLE_REVIEWERS) add(reviewer);
  for (const employee of employees) if (employee.status === "Active") add({ name: employee.name, title: employee.jobTitle });
  return options;
}

/** Title recorded with an approval, e.g. "CEO" for Imran Sheikh. */
export function approverTitle(name: string): string {
  const key = name.trim().toLowerCase();
  return (
    SAMPLE_REVIEWERS.find((reviewer) => reviewer.name.toLowerCase() === key)?.title ??
    employees.find((employee) => employee.name.toLowerCase() === key)?.jobTitle ??
    ""
  );
}

export const samePerson = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
