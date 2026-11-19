// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
import { UserSheet } from "../../app/features/administration/components/user-sheet";
import type { AdministrationClient } from "../../app/features/administration/api/administration-client";

let root: Root, container: HTMLDivElement;
const createUser = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  createUser.mockReset();
  act(() =>
    root.render(
      <UserSheet
        open
        onOpenChange={vi.fn()}
        user={null}
        users={[]}
        companies={[{ id: "company-1", code: "CO-001", name: "Example company" }]}
        actorId="owner"
        client={{ createUser } as unknown as AdministrationClient}
        onCredential={vi.fn()}
        onSaved={vi.fn()}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function selectTab(label: string) {
  const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (tab) => tab.textContent === label,
  )!;
  act(() => tab.click());
}
describe("Administration user drawer sections", () => {
  it("keeps entered details and default company while switching sections", () => {
    const input = container.querySelector<HTMLInputElement>("input[required]")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Reviewer");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    selectTab("Companies");
    expect(container.querySelector('input[name="default-company"]:checked')).not.toBeNull();
    selectTab("Access");
    expect(container.querySelector('[aria-label="Find a module"]')).not.toBeNull();
    selectTab("Details");
    expect(input.value).toBe("Reviewer");
    expect(createUser).not.toHaveBeenCalled();
  });
  it("returns to invalid details when submission starts on Review", async () => {
    selectTab("Review");
    await act(async () =>
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Details");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(createUser).not.toHaveBeenCalled();
  });
});
