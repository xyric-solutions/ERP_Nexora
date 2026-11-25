// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkForm } from "../../app/shared/ui/work-form";
import { WorkspaceHeader } from "../../app/shared/ui/module-design";
import { ProfileFormHeader, ProfileFormFooter } from "../../app/shared/ui/profile-form";
import { EntryActionBar } from "../../app/features/sales/components/sales-ui";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("omits form header guidance while preserving workspace descriptions", () => {
  act(() =>
    root.render(
      <>
        <WorkspaceHeader eyebrow="Sales" title="Quotations" description="Workspace summary" />
        <WorkForm>
          <WorkspaceHeader eyebrow="Sales" title="New quotation" description="Choose the actual customer." />
        </WorkForm>
      </>,
    ),
  );
  expect(container.textContent).toContain("Workspace summary");
  expect(container.textContent).toContain("New quotation");
  expect(container.querySelector("form p")).not.toBeNull(); // Eyebrow remains.
  expect(container.textContent).not.toContain("Choose the actual customer.");
});
it("does not leave an empty action-bar message and still displays save errors", () => {
  const props = { saveLabel: "Save", lifecycle: ["Draft", "Posted"], onDiscard: vi.fn() };
  act(() => root.render(<EntryActionBar {...props} />));
  expect(container.querySelector("section")?.children).toHaveLength(2);
  expect(container.querySelector('[aria-label="Document lifecycle"]')?.textContent).toBe("DraftPosted");
  act(() => root.render(<EntryActionBar {...props} error="Customer is required." />));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Customer is required.");
});
it("keeps profile codes and actions without instructional rows or blank footer slots", () => {
  act(() =>
    root.render(
      <WorkForm>
        <ProfileFormHeader
          action="Add"
          title="New customer"
          description="Complete this profile."
          codeLabel="Code"
          code="CUS-001"
        />
        <ProfileFormFooter>
          <button type="submit">Save</button>
        </ProfileFormFooter>
      </WorkForm>,
    ),
  );
  expect(container.querySelector("input")?.value).toBe("CUS-001");
  expect(container.querySelector("input")?.readOnly).toBe(true);
  expect(container.querySelectorAll("header p, footer p")).toHaveLength(0);
  expect(container.textContent).not.toContain("Complete this profile.");
  expect(container.querySelector("footer")?.children).toHaveLength(1);
  expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Save");
});
