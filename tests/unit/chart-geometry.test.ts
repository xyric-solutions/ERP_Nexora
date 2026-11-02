import { describe, expect, it } from "vitest";
import { chartLinePath } from "../../app/shared/ui/chart-geometry";

describe("reference graph interpolation", () => {
  it("keeps empty and single-observation charts honest", () => {
    expect(chartLinePath([])).toBe("");
    expect(chartLinePath([{ x: 4, y: 9 }])).toBe("M4 9");
  });
  it("passes through each observation without overshooting reversals or flat intervals", () => {
    const points = [10, 80, 5, 5, 45, 12, 90, 21].map((y, index) => ({ x: index * 17, y }));
    const path = chartLinePath(points);
    const segments = [...path.matchAll(/C([^C]+)/g)];
    expect(segments).toHaveLength(points.length - 1);
    segments.forEach((segment, index) => {
      const [x1, y1, x2, y2, x3, y3] = segment[1].trim().split(/[ ,]+/).map(Number);
      const start = points[index],
        end = points[index + 1];
      expect([x3, y3]).toEqual([end.x, end.y]);
      expect(x1).toBeGreaterThanOrEqual(start.x);
      expect(x2).toBeLessThanOrEqual(end.x);
      for (let step = 0; step <= 20; step++) {
        const t = step / 20;
        const y = (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3 * y3;
        expect(y).toBeGreaterThanOrEqual(Math.min(start.y, end.y) - 1e-8);
        expect(y).toBeLessThanOrEqual(Math.max(start.y, end.y) + 1e-8);
      }
    });
  });
});
