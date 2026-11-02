type Point = { x: number; y: number };

/** Monotone cubic joins through the original observations; no resampling or aggregation. */
export function chartLinePath(points: readonly Point[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  const delta = points.slice(1).map((point, index) => {
    const dx = point.x - points[index].x;
    return dx > 0 ? (point.y - points[index].y) / dx : 0;
  });
  const slopes = points.map((_, index) => {
    if (index === 0) return delta[0];
    if (index === points.length - 1) return delta[index - 1];
    const left = delta[index - 1],
      right = delta[index];
    if (left * right <= 0) return 0;
    return (
      Math.sign(left) *
      Math.min(
        (2 * Math.abs(left * right)) / (Math.abs(left) + Math.abs(right)),
        1.2 * Math.min(Math.abs(left), Math.abs(right)),
      )
    );
  });
  let path = `M${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const next = points[index + 1],
      current = points[index];
    const handle = (next.x - current.x) * 0.4;
    path += ` C${current.x + handle} ${current.y + slopes[index] * handle},${next.x - handle} ${next.y - slopes[index + 1] * handle},${next.x} ${next.y}`;
  }
  return path;
}
