/**
 * Drill engine gates.
 *
 * Each test maps to a rule in the drill architecture document. The rules are
 * constraints, so they are asserted rather than trusted.
 *
 * Two honest limits of this harness:
 *  - The renderer and visuals are .tsx, and Node's type stripping cannot
 *    execute JSX, so rules about their structure are asserted against source
 *    text rather than by rendering. Data-level rules are asserted by running
 *    the real aggregation.
 *  - The server rules are waived in the prototype (there is no server); the
 *    whitelist seam is still asserted, because that is client-visible.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const drillDir = fileURLToPath(new URL("../app/drill/", import.meta.url));
const stamp = `${process.pid}-${Date.now()}`;

async function load(rel) {
  const url = new URL(`../app/${rel}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

const source = (rel) => readFile(drillDir + rel, "utf8");
/** Strip comments so prose about a rule never satisfies the rule. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---------------------------------------------------------------- one renderer */

test("there is exactly one dashboard renderer", async () => {
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      if (entry.isDirectory()) out.push(...(await walk(`${dir}${entry.name}/`)));
      else out.push(`${dir}${entry.name}`);
    }
    return out;
  };
  const files = await walk(drillDir);
  const renderers = files.filter((file) => /renderer/i.test(file));
  assert.equal(renderers.length, 1, `expected one renderer, found: ${renderers.join(", ")}`);
  assert.match(renderers[0], /drill-renderer\.tsx$/);

  // No per-screen or per-module drill component anywhere else in the app.
  // Paths are normalised because this also runs on Windows.
  const appDir = fileURLToPath(new URL("../app/", import.meta.url));
  const appFiles = (await walk(appDir)).map((file) => file.split("\\").join("/"));
  const insideEngine = (file) => file.includes("/app/drill/");
  const isStylesheet = (file) => file.endsWith("/app/drill.css");
  const perModule = appFiles.filter(
    (file) => /drill/i.test(file) && !insideEngine(file) && !isStylesheet(file),
  );
  assert.deepEqual(perModule, [], "drill components must live only in app/drill/");
});

test("the renderer carries zero domain knowledge", async () => {
  const renderer = code(await source("drill-renderer.tsx"));
  const visuals = code(await source("visuals.tsx"));

  // Domain vocabulary that must never appear in a generic renderer.
  const domain = [
    "account", "customer", "supplier", "invoice", "journal", "warehouse",
    "inventory", "ledger", "revenue", "payable", "receivable", "tax",
    "finance", "sales", "procurement", "voucher", "debit", "credit",
  ];
  for (const word of domain) {
    const pattern = new RegExp(`\\b${word}`, "i");
    assert.doesNotMatch(renderer, pattern, `the renderer must not mention "${word}"`);
    assert.doesNotMatch(visuals, pattern, `visuals must not mention "${word}"`);
  }

  // And no module branching.
  const { listDrillEntries } = await load("drill/registry.ts");
  for (const entry of listDrillEntries()) {
    assert.ok(!renderer.includes(`"${entry.moduleId}"`), `renderer must not reference module ${entry.moduleId}`);
    assert.ok(!renderer.includes(`"${entry.pageId}"`), `renderer must not reference page ${entry.pageId}`);
  }
});

test("adding a module is a registration, not a renderer change", async () => {
  const { listFactViews, listDrillEntries, getChain } = await load("drill/registry.ts");
  const views = listFactViews();
  assert.ok(views.length >= 4, "several modules should be registered to prove the abstraction generalises");
  for (const view of views) {
    assert.ok(view.chains.length >= 1, `${view.id} needs at least one dimension chain`);
    assert.ok(view.rows.length > 0, `${view.id} needs fact rows`);
  }
  // Every registered screen resolves to a real view and chain.
  for (const entry of listDrillEntries()) {
    assert.ok(getChain(entry.viewId, entry.chainId), `${entry.moduleId}/${entry.pageId} has an unresolvable chain`);
  }
});

/* ------------------------------------------------------------------ fact rows */

test("every fact row is flat, dated, periodised and integer-valued", async () => {
  const { listFactViews } = await load("drill/registry.ts");
  for (const view of listFactViews()) {
    for (const row of view.rows) {
      assert.equal(typeof row.id, "string");
      assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/, `${view.id}: date must be ISO`);
      assert.match(row.period, /^\d{4}-\d{2}$/, `${view.id}: period must be YYYY-MM`);
      // Precomputed, and therefore consistent with the date.
      assert.equal(row.period, row.date.slice(0, 7), `${view.id}: period must match the date`);
      assert.ok(typeof row.documentId === "string" && row.documentId.length > 0);
      assert.ok(typeof row.documentType === "string" && row.documentType.length > 0);
      // Money is integer minor units. Never float.
      assert.ok(Number.isInteger(row.amount), `${view.id}: amount ${row.amount} must be an integer`);
    }
  }
});

test("a dimension can only drill by an attribute present on the row", async () => {
  const { listFactViews } = await load("drill/registry.ts");
  for (const view of listFactViews()) {
    for (const chain of view.chains) {
      let dimension = chain.root;
      while (dimension) {
        const present = view.rows.some((row) => row[dimension.column] !== undefined);
        assert.ok(present, `${view.id}: dimension ${dimension.id} reads column ${dimension.column}, absent from the rows`);
        dimension = dimension.next;
      }
    }
  }
});

/* ---------------------------------------------------------------- correctness */

test("children sum to the parent at every layer, to full depth", async () => {
  const { listFactViews } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");

  let layersChecked = 0;

  const walk = (chain, rows, stack) => {
    const layer = computeLayer(chain, rows, stack);
    layersChecked += 1;
    // The headline equals the sum of its children, by construction.
    assert.equal(
      layer.bucketTotal,
      layer.splitBy ? layer.total : 0,
      `layer ${stack.map((n) => n.key).join("/") || "root"} does not equal the sum of its children`,
    );
    if (!layer.splitBy) return;
    // Depth-first into the two largest children keeps the run bounded while
    // still reaching the leaf on every chain.
    for (const bucket of layer.buckets.slice(0, 2)) {
      walk(chain, rows, [...stack, { dimensionId: layer.splitBy.id, key: bucket.key, label: bucket.label }]);
    }
  };

  for (const view of listFactViews()) {
    for (const chain of view.chains) walk(chain, view.rows, []);
  }
  assert.ok(layersChecked > 20, `expected to check many layers, checked ${layersChecked}`);
});

test("each layer's rows are a strict subset of its parent's", async () => {
  const { getFactView } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");
  const view = getFactView("finance-gl");
  const chain = view.chains[0];

  const root = computeLayer(chain, view.rows, []);
  const first = root.buckets[0];
  const child = computeLayer(chain, view.rows, [
    { dimensionId: root.splitBy.id, key: first.key, label: first.label },
  ]);

  assert.ok(child.rows.length > 0, "a child layer must have rows");
  assert.ok(child.rows.length < root.rows.length, "a child must be strictly narrower than its parent");
  const rootIds = new Set(root.rows.map((row) => row.id));
  for (const row of child.rows) assert.ok(rootIds.has(row.id), "a child row must exist in the parent");
  assert.equal(child.total, first.value, "the child's total must equal the bucket the user clicked");
});

/* ------------------------------------------------------- dimensions and server seam */

test("dimension ids resolve to columns only through the whitelist", async () => {
  const { resolveColumn, isKnownDimension } = await load("drill/registry.ts");

  assert.equal(resolveColumn("finance-gl", "section"), "section");
  assert.equal(resolveColumn("sales-revenue", "customer"), "customer");

  // An unknown id is rejected. A real implementation answers 400.
  assert.throws(() => resolveColumn("finance-gl", "amount; DROP TABLE"), /unknown dimension id/);
  assert.throws(() => resolveColumn("finance-gl", "not-a-dimension"), /unknown dimension id/);
  assert.throws(() => resolveColumn("no-such-view", "section"), /unknown fact view/);
  assert.equal(isKnownDimension("finance-gl", "section"), true);
  assert.equal(isKnownDimension("finance-gl", "injected_column"), false);

  // No caller may pass a column name: the engine takes dimension ids only.
  const renderer = code(await source("drill-renderer.tsx"));
  const hook = code(await source("use-drill.ts"));
  for (const text of [renderer, hook]) {
    assert.doesNotMatch(text, /\bGROUP BY\b/i, "no query construction on the client");
    assert.doesNotMatch(text, /resolveColumn\s*\(/, "the client must not resolve columns");
  }
});

/* -------------------------------------------------------------------- the URL */

test("the drill path round-trips through the URL", async () => {
  const { serialisePath, parsePath, readPathFromLocation, writeHash } = await load("drill/url.ts");

  const stack = [
    { dimensionId: "group", key: "salaries", label: "Salaries" },
    { dimensionId: "account", key: "710101", label: "710101" },
  ];
  const path = serialisePath(stack);
  assert.equal(path, "group:salaries/account:710101");

  const parsed = parsePath(path);
  assert.deepEqual(parsed, [
    { dimensionId: "group", key: "salaries" },
    { dimensionId: "account", key: "710101" },
  ]);

  // Keys that need escaping survive the round trip.
  const tricky = serialisePath([{ dimensionId: "customer", key: "Smith / Co", label: "Smith / Co" }]);
  assert.deepEqual(parsePath(tricky), [{ dimensionId: "customer", key: "Smith / Co" }]);

  // Malformed segments are ignored rather than producing a bogus layer.
  assert.deepEqual(parsePath("garbage//also-garbage"), []);
  assert.deepEqual(parsePath(""), []);

  assert.equal(readPathFromLocation("?path=a:1", ""), "a:1");
  assert.equal(readPathFromLocation("", "#/finance/general-ledger?path=b:2"), "b:2");
  assert.equal(writeHash("finance", "general-ledger", stack), "#/finance/general-ledger?path=group:salaries/account:710101");
  assert.equal(writeHash("finance", "general-ledger", []), "#/finance/general-ledger");
});

test("the navigation stack is the only source of navigation state", async () => {
  const hook = code(await source("use-drill.ts"));
  // One useState for the stack; breadcrumb, back and Escape all read it.
  const stateCount = (hook.match(/useState</g) ?? []).length;
  assert.equal(stateCount, 1, "useDrill should hold exactly one piece of state: the stack");
  assert.match(hook, /Escape/, "Escape must step back one layer");

  const renderer = code(await source("drill-renderer.tsx"));
  assert.doesNotMatch(renderer, /useState<DrillNode/, "the renderer must not keep its own stack");
});

/* ------------------------------------------------------------- required edges */

test("a partial edge period is excluded from comparison and labelled", async () => {
  const { getFactView } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");
  const { PARTIAL_LAST_DAY, PERIODS } = await load("drill/views/build.ts");

  const view = getFactView("finance-gl");
  const layer = computeLayer(view.chains[0], view.rows, []);

  const last = layer.trend[layer.trend.length - 1];
  assert.equal(last.period, PERIODS[PERIODS.length - 1]);
  assert.equal(last.partial, true, "the clipped final period must be flagged partial");
  assert.ok(layer.trend.slice(0, -1).every((p) => !p.partial), "only the edge period is partial");

  assert.ok(layer.comparison, "a comparison should be available");
  assert.equal(layer.comparison.excludedPartial, last.period, "the partial period must be named as excluded");
  // The comparison uses the two most recent FULL periods.
  const full = layer.trend.filter((p) => !p.partial);
  assert.equal(layer.comparison.current, full[full.length - 1].value);
  assert.equal(layer.comparison.previous, full[full.length - 2].value);

  // And the fixture really is clipped.
  const lastDays = view.rows.filter((r) => r.period === last.period).map((r) => Number(r.date.slice(8, 10)));
  assert.ok(Math.max(...lastDays) <= PARTIAL_LAST_DAY);
});

test("a zero-value child is explained rather than shown blank", async () => {
  const { listFactViews } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");

  // Zero buckets must be reachable somewhere, or the rule is untested.
  let found = null;
  outer: for (const view of listFactViews()) {
    for (const chain of view.chains) {
      const root = computeLayer(chain, view.rows, []);
      const walk = (stack, depth) => {
        const layer = computeLayer(chain, view.rows, stack);
        const zero = layer.buckets.find((b) => b.empty);
        if (zero) return { layer, zero };
        if (!layer.splitBy || depth > 3) return null;
        for (const bucket of layer.buckets.slice(0, 3)) {
          const hit = walk([...stack, { dimensionId: layer.splitBy.id, key: bucket.key, label: bucket.label }], depth + 1);
          if (hit) return hit;
        }
        return null;
      };
      void root;
      const hit = walk([], 0);
      if (hit) { found = hit; break outer; }
    }
  }
  assert.ok(found, "a zero-value bucket should exist in the fixtures so the explanation is reviewable");
  assert.equal(found.zero.value, 0);
  assert.ok(found.zero.count > 0, "a zero bucket still holds rows - it nets to zero, it is not absent");

  // The renderer explains it instead of opening a blank panel.
  const renderer = code(await source("drill-renderer.tsx"));
  assert.match(renderer, /bucket\.empty/, "the renderer must detect zero-value children");
  assert.match(renderer, /nx-drill__zero-note/, "the renderer must render the explanation");
});

test("a single child shows a cumulative line, not a one-slice donut", async () => {
  const { getFactView } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");
  const view = getFactView("finance-gl");
  const chain = view.chains[0];

  // Narrow to one document: its next level has exactly one child.
  const oneDoc = view.rows.filter((row) => row.documentId === view.rows[0].documentId);
  const layer = computeLayer(chain, oneDoc, []);
  assert.equal(layer.buckets.length, 1, "this scope should yield a single child");

  const renderer = code(await source("drill-renderer.tsx"));
  assert.match(renderer, /const single = layer\.buckets\.length === 1/, "the renderer must detect a single child");
  assert.match(renderer, /single \?\s*\(?\s*<DrillCumulative/, "a single child must render the cumulative line");
});

test("the breadcrumb collapses in the middle, keeping root and current", async () => {
  const { collapseTrail } = await load("drill/aggregate.ts");

  assert.deepEqual(collapseTrail(["a", "b"], 4), { head: ["a", "b"], collapsed: [], tail: [] });
  assert.deepEqual(collapseTrail(["a", "b", "c", "d"], 4), { head: ["a", "b", "c", "d"], collapsed: [], tail: [] });

  const deep = collapseTrail(["root", "l1", "l2", "l3", "l4", "current"], 4);
  assert.deepEqual(deep.head, ["root"], "root stays visible");
  assert.deepEqual(deep.tail, ["l4", "current"], "the current level stays visible");
  assert.deepEqual(deep.collapsed, ["l1", "l2", "l3"], "the middle collapses");
});

test("changing the period range recomputes the layer instead of closing it", async () => {
  const { getFactView } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");
  const view = getFactView("finance-gl");
  const chain = view.chains[0];

  const root = computeLayer(chain, view.rows, []);
  const stack = [{ dimensionId: root.splitBy.id, key: root.buckets[0].key, label: root.buckets[0].label }];

  const wide = computeLayer(chain, view.rows, stack);
  const narrowRows = view.rows.filter((row) => row.period >= "2026-07");
  const narrow = computeLayer(chain, narrowRows, stack);

  // Same stack, narrower rows: the layer still exists and is still valid.
  assert.ok(narrow.rows.length > 0, "the layer must survive a range change");
  assert.ok(narrow.rows.length < wide.rows.length, "the range must actually narrow the layer");
  assert.equal(narrow.splitBy.id, wide.splitBy.id, "the layer stays at the same depth");
  assert.equal(narrow.bucketTotal, narrow.total, "and still adds up");

  // The renderer derives the layer from (stack, rows), so nothing can close it.
  const hook = code(await source("use-drill.ts"));
  assert.match(hook, /periodFrom/, "the hook must accept a range");
  assert.doesNotMatch(hook, /setStack\(\[\]\)/, "a range change must never reset the stack");
});

/* --------------------------------------------------- uniform intent and a11y */

test("every visual emits the same descend intent", async () => {
  const visuals = code(await source("visuals.tsx"));
  // Each visual takes onPick / onPickPoint and calls it. None navigates itself.
  assert.doesNotMatch(visuals, /useDrill|setStack|descend\(/, "a chart must not navigate; it emits a bucket");
  const pickers = (visuals.match(/onPick\?\?\(|onPick\(|onPickPoint\?\.\(/g) ?? []).length;
  assert.ok(pickers >= 3, `expected several visuals to emit the shared intent, found ${pickers}`);

  // The multi-series convention is implemented once, centrally.
  assert.match(visuals, /bucketFromSeries/, "the dataset/point index convention must be shared");
});

test("children are keyboard reachable and the back button names its target", async () => {
  const visuals = code(await source("visuals.tsx"));
  const renderer = code(await source("drill-renderer.tsx"));

  // Buckets are real buttons: Tab reaches them and Enter activates them.
  assert.match(visuals, /<button/, "clickable children must be buttons");
  assert.doesNotMatch(visuals, /<div[^>]*onClick/, "a div with onClick is not keyboard reachable");
  assert.doesNotMatch(renderer, /<div[^>]*onClick/, "a div with onClick is not keyboard reachable");

  // Back is labelled with the level it returns to, and hidden at root.
  assert.match(renderer, /atRoot \? null : \(/, "the back button must be hidden at root");
  assert.match(renderer, /\{backLabel\}/, "the back button must be labelled with its target level");
  assert.doesNotMatch(renderer, />\s*Back\s*</, 'the back button must not be labelled "Back"');

  // Accessible names on the visuals.
  assert.match(visuals, /aria-label=/, "visual controls need accessible names");
});

test("leaf detail is paginated, not shipped whole", async () => {
  const renderer = code(await source("drill-renderer.tsx"));
  assert.match(renderer, /LEAF_PAGE_SIZE/, "leaf detail must be paginated");
  assert.match(renderer, /atLeaf \?/, "detail rows appear only at the leaf");

  const { getFactView } = await load("drill/registry.ts");
  const { computeLayer } = await load("drill/aggregate.ts");
  const view = getFactView("finance-gl");
  // The root holds far more rows than one page, so pagination is real.
  assert.ok(computeLayer(view.chains[0], view.rows, []).rows.length > 25);
});

test("the prototype waiver of the server rules is written down", async () => {
  const types = await source("types.ts");
  const registry = await source("registry.ts");
  assert.match(types, /WAIVED/, "the waiver must be explicit, not implied");
  assert.match(registry, /whitelist/i, "the whitelist seam must be documented");
  assert.match(registry, /400/, "the real behaviour for an unknown id must be recorded");
});
