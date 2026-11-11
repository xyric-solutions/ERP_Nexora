/** Compose a UI page from bounded, independently validated API reads. No posting behavior is involved. */
export async function readWorkPage<Query extends { limit: number; offset: number }, Result>(
  input: Query,
  load: (query: Query) => Promise<Result>,
  merge: (first: Result, second: Result) => Result,
): Promise<Result> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new RangeError("Work pages must contain between 1 and 100 rows.");
  const first = await load({ ...input, limit: Math.min(input.limit, 50) });
  if (input.limit <= 50) return first;
  const second = await load({ ...input, offset: input.offset + 50, limit: input.limit - 50 });
  if (
    first &&
    typeof first === "object" &&
    "source_hash" in first &&
    second &&
    typeof second === "object" &&
    "source_hash" in second &&
    first.source_hash !== second.source_hash
  )
    throw new Error("Records changed while loading this page. Refresh and try again.");
  return merge(first, second);
}
