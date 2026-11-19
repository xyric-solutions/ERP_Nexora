// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ company: "company-a", list: vi.fn() }));
vi.mock("@/lib/session/session-provider", () => {
  const api = { listReferenceMasters: fixture.list };
  return { useSession: () => ({ api, session: { tenant_id: "tenant-a", active_company: { id: fixture.company } } }) };
});
vi.mock("@/shared/ui/searchable-select", async () => ({
  SearchableSelect: (await import("./searchable-select-double.js")).SearchableSelectDouble,
}));
import { ProjectServiceField } from "../../app/features/projects/components/project-service-field.js";

let container: HTMLDivElement, root: Root;
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(210);
  });
}
function search(value: string) {
  const input = container.querySelector('input[aria-label="Search project"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.company = "company-a";
  fixture.list.mockReset();
  fixture.list.mockResolvedValue({
    items: [{ id: "prj-a", code: "PRJ-001", name: "Atlas rollout" }],
    next_cursor: "page-2",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("searches the server in company scope and loads further pages", async () => {
  act(() => root.render(<ProjectServiceField />));
  await settle();
  search("Atlas");
  await settle();
  const query = new URLSearchParams(fixture.list.mock.calls.at(-1)![1]);
  expect(fixture.list.mock.calls.at(-1)![0]).toBe("projects");
  expect(query.get("company_id")).toBe("company-a");
  expect(query.get("search")).toBe("Atlas");
  expect(query.get("limit")).toBe("100");
  const more = [...container.querySelectorAll("button")].find((x) => x.textContent === "Load more projects")!;
  fixture.list.mockResolvedValueOnce({
    items: [{ id: "prj-b", code: "PRJ-002", name: "Atlas phase two" }],
    next_cursor: null,
  });
  await act(async () => more.click());
  expect(new URLSearchParams(fixture.list.mock.calls.at(-1)![1]).get("cursor")).toBe("page-2");
  expect(container.textContent).toContain("Atlas phase two");
});

it("hides old company options immediately when company scope changes", async () => {
  act(() => root.render(<ProjectServiceField />));
  await settle();
  expect(container.textContent).toContain("Atlas rollout");
  fixture.company = "company-b";
  act(() => root.render(<ProjectServiceField />));
  expect(container.textContent).not.toContain("Atlas rollout");
  await settle();
  expect(new URLSearchParams(fixture.list.mock.calls.at(-1)![1]).get("company_id")).toBe("company-b");
});

it("shows a failed lookup and retries without making a business-data mutation", async () => {
  fixture.list.mockRejectedValueOnce(new Error("offline"));
  act(() => root.render(<ProjectServiceField />));
  await settle();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Projects could not be loaded");
  act(() => [...container.querySelectorAll("button")].find((x) => x.textContent === "Retry")!.click());
  await settle();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Atlas rollout");
});
