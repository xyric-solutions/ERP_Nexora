import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

export const workPageSizes = [10, 25, 50, 100] as const;
export type WorkPageSize = (typeof workPageSizes)[number];
export type WorkFilter = { column: number; operator: "contains" | "equals" | "excludes" | "empty"; value: string };
export type TableNode = ReactElement<{
  children?: ReactNode;
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
  className?: string;
  style?: React.CSSProperties;
}>;
export function tableNodes(children: ReactNode): TableNode[] {
  const result: TableNode[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<TableNode["props"]>(child)) return;
    if (child.type === Fragment) result.push(...tableNodes(child.props.children));
    else result.push(child);
  });
  return result;
}
/** Search only presentation props; never inspect hidden business-record objects. */
export function tableText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(tableText).join(" ");
  if (!isValidElement<{ children?: ReactNode; value?: unknown; title?: string; "aria-label"?: string }>(node))
    return "";
  return [
    tableText(node.props.children),
    node.props.title ?? "",
    node.props["aria-label"] ?? "",
    typeof node.props.value === "string" || typeof node.props.value === "number" ? String(node.props.value) : "",
  ]
    .join(" ")
    .trim();
}
export function rowMatches(cells: readonly string[], search: string, filters: readonly WorkFilter[]) {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (search && !normalize(cells.join(" ")).includes(normalize(search))) return false;
  return filters.every((filter) => {
    const value = normalize(cells[filter.column] ?? ""),
      term = normalize(filter.value);
    if (filter.operator === "empty") return !value || value === "—";
    if (filter.operator === "equals") return value === term;
    if (filter.operator === "excludes") return !value.includes(term);
    return value.includes(term);
  });
}
export function workPageBounds(count: number, page: number, size: number) {
  const index = Math.max(0, Math.min(page, Math.max(0, Math.ceil(count / size) - 1)));
  return { index, start: count ? index * size + 1 : 0, end: Math.min(count, (index + 1) * size) };
}
