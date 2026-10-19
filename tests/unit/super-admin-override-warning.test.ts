// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuperAdminOverrideWarning } from "../../app/shared/ui/super-admin-override-warning.js";

describe("SuperAdminOverrideWarning", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("explains the audited maker-checker exception with alert semantics", async () => {
    await act(async () => root.render(createElement(SuperAdminOverrideWarning)));

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("Super-admin override");
    expect(container.textContent).toContain("permanently audited");
  });
});
