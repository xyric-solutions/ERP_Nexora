import { describe, expect, it, vi } from "vitest";
import { readWorkPage } from "../../app/features/hr/api/read-work-page.js";
describe("Bounded HR work pages", () => {
  it("loads 100 rows in two authorized batches and preserves company, search and offset", async () => {
    const input = { company_id: "company-a", search: "Ada", limit: 100, offset: 200 };
    const load = vi.fn(async (q: typeof input) => ({
      items: Array.from({ length: q.limit }, (_, i) => q.offset + i),
      total: 450,
      limit: q.limit,
      source_hash: "same",
    }));
    const result = await readWorkPage(input, load, (a, b) => ({
      ...a,
      limit: input.limit,
      items: [...a.items, ...b.items],
    }));
    expect(load.mock.calls.map(([q]) => q)).toEqual([
      { ...input, limit: 50 },
      { ...input, limit: 50, offset: 250 },
    ]);
    expect(result.items).toHaveLength(100);
    expect(result.items[0]).toBe(200);
    expect(result.items.at(-1)).toBe(299);
    expect(result.total).toBe(450);
    expect(result.limit).toBe(100);
  });
  it("keeps short pages to one request and returns the server result unchanged", async () => {
    const first = { items: [1], total: 1 };
    const load = vi.fn(async () => first),
      merge = vi.fn((a: typeof first) => a);
    expect(await readWorkPage({ limit: 10, offset: 0 }, load, merge)).toBe(first);
    expect(load).toHaveBeenCalledOnce();
    expect(merge).not.toHaveBeenCalled();
  });
  it("does not present a partially loaded page after a second-batch failure", async () => {
    let count = 0;
    await expect(
      readWorkPage(
        { limit: 100, offset: 0 },
        async () => {
          if (count++) throw Error("denied");
          return { items: [1] };
        },
        (a, b) => ({ items: [...a.items, ...b.items] }),
      ),
    ).rejects.toThrow("denied");
  });
  it("rejects a changed payroll snapshot between batches", async () => {
    let count = 0;
    await expect(
      readWorkPage(
        { limit: 100, offset: 0 },
        async () => ({ items: [count++], source_hash: String(count) }),
        (a, b) => ({ ...a, items: [...a.items, ...b.items] }),
      ),
    ).rejects.toThrow("Records changed");
  });
  it("rejects oversized requests before any API read", async () => {
    const load = vi.fn(async () => ({ items: [] }));
    await expect(readWorkPage({ limit: 101, offset: 0 }, load, (a) => a)).rejects.toThrow("between 1 and 100");
    expect(load).not.toHaveBeenCalled();
  });
});
