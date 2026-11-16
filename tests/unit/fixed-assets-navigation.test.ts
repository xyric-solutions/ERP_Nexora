import { describe, expect, it } from "vitest";
import { findPrototypePage, prototypeModules, prototypePageIndex } from "../../app/shell/config/prototype-data.js";

describe("Fixed Assets workpage navigation", () => {
  it("starts with classes and the register and keeps record workflows off the menu/search index", () => {
    const assets = prototypeModules.find((module) => module.id === "assets")!;
    const visible = assets.groups
      .filter((group) => !group.hiddenFromNavigation)
      .flatMap((group) => group.pages.filter((page) => !page.hiddenFromNavigation));
    expect(visible.slice(0, 2).map((page) => page.id)).toEqual(["asset-classes", "assets"]);
    for (const page of ["add-asset", "asset-detail", "asset-acquisition", "capitalisation"]) {
      expect(visible.map((item) => item.id)).not.toContain(page);
      expect(findPrototypePage("assets", page).page.id).toBe(page);
      const indexed = prototypePageIndex.find((entry) => entry.moduleId === "assets" && entry.id === page)!;
      expect(indexed.hiddenFromNavigation || indexed.groupHiddenFromNavigation).toBe(true);
    }
  });

  it("moves return bookmarks into Purchase without falling back to an unrelated page", () => {
    for (const [oldPage, nextPage] of [
      ["asset-return", "purchase-returns"],
      ["asset-refund", "purchase-refunds"],
    ]) {
      const target = findPrototypePage("assets", oldPage);
      expect(target.module.id).toBe("purchases");
      expect(target.page.id).toBe(nextPage);
    }
    const assets = prototypeModules.find((module) => module.id === "assets")!;
    expect(
      assets.groups.flatMap((group) => group.pages).some((page) => ["asset-return", "asset-refund"].includes(page.id)),
    ).toBe(false);
    expect(findPrototypePage("purchases", "purchase-bill-returns").page.hiddenFromNavigation).toBe(true);
    expect(findPrototypePage("purchases", "purchase-returns").page.hiddenFromNavigation).toBe(false);
    expect(findPrototypePage("purchases", "supplier-returns").page.id).toBe("purchase-returns");
  });
});
