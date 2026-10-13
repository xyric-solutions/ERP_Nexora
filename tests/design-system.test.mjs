/**
 * Design-system gate.
 *
 * The prototype's look was previously held together by four competing token
 * declarations and an `!important` override layer, with 484 font-size
 * declarations at or below 12px (table headers were 8px). That was fixed by
 * consolidating tokens into `tokens.css` and normalizing the component CSS.
 *
 * These checks keep it fixed. They are deliberately mechanical: each one
 * corresponds to a specific defect that shipped once already.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));

async function cssFiles() {
  const entries = await readdir(appDir);
  const names = entries.filter((name) => name.endsWith(".css"));
  return Promise.all(
    names.map(async (name) => ({ name, source: await readFile(appDir + name, "utf8") })),
  );
}

/** Strip comments so documentation prose never trips a source check. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

test("tokens.css is the single source of design tokens", async () => {
  const files = await cssFiles();
  // A *global* token is one declared on the `.nx-prototype` root (optionally
  // with a theme/density attribute, optionally inside a media query). Those
  // must live only in tokens.css. Component-scoped locals - a chart setting
  // its own `--nx-viz-tone`, for instance - are a different thing and stay
  // with their component.
  const definers = files
    .filter(({ source }) =>
      /\.nx-prototype[^{]*\{[^}]*--nx-[a-z0-9-]+\s*:/s.test(code(source)))
    .map(({ name }) => name);
  assert.deepEqual(
    definers,
    ["tokens.css"],
    "only tokens.css may declare global --nx-* tokens; a second declaration site is what forced !important overrides before",
  );

  const tokens = files.find((file) => file.name === "tokens.css");
  assert.ok(tokens, "tokens.css must exist");
  for (const required of [
    "--nx-size-micro", "--nx-size-body", "--nx-size-page",
    "--nx-radius-sm", "--nx-shadow-xs", "--nx-font-serif",
    "--nx-brand", "--nx-canvas", "--nx-text-strong",
  ]) {
    assert.ok(tokens.source.includes(required), `tokens.css must define ${required}`);
  }

  // Light, dark and compact must all be defined in the one file.
  assert.match(tokens.source, /\[data-theme="dark"\]/, "dark theme tokens belong in tokens.css");
  assert.match(tokens.source, /\[data-density="compact"\]/, "density tokens belong in tokens.css");
});

test("no interface text is set below the 11px legibility floor", async () => {
  const files = await cssFiles();
  const offenders = [];
  for (const { name, source } of files) {
    for (const match of code(source).matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)) {
      if (Number(match[1]) < 11) offenders.push(`${name}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "font sizes below 11px read as a mockup, not as software");
});

test("the type scale stays small and deliberate", async () => {
  const files = await cssFiles();
  const sizes = new Set();
  for (const { source } of files) {
    for (const match of code(source).matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)) {
      sizes.add(Number(match[1]));
    }
  }
  // Twenty distinct sizes was the old state. Hold the line well under that.
  assert.ok(
    sizes.size <= 12,
    `expected at most 12 distinct px font sizes, found ${sizes.size}: ${[...sizes].sort((a, b) => a - b).join(", ")}`,
  );
});

test("surfaces are flat and radii stay in the classic scale", async () => {
  const files = await cssFiles();

  // Decorative gradients were removed; repeating gradients draw rules and stay.
  const gradients = [];
  for (const { name, source } of files) {
    const stripped = code(source).replace(/repeating-linear-gradient/g, "");
    for (const match of stripped.matchAll(/linear-gradient\(/g)) {
      gradients.push(`${name} @${match.index}`);
    }
  }
  assert.deepEqual(gradients, [], "decorative gradients belong to consumer SaaS, not to classic enterprise surfaces");

  // Radii: the 5-24px band was remapped onto 2/3/4/6. Pills and circles stay.
  const radii = [];
  for (const { name, source } of files) {
    for (const match of code(source).matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}]+)/g)) {
      for (const token of match[1].split(/\s+/)) {
        const px = /^([0-9]+)px$/.exec(token.trim());
        // Pills (99px / 999px) and circles (50%) are deliberate and exempt;
        // the 7-89px band is the consumer-SaaS rounding that was removed.
        const value = px ? Number(px[1]) : 0;
        if (px && value > 6 && value < 90) radii.push(`${name}: ${match[0].trim()}`);
      }
    }
  }
  assert.deepEqual(radii, [], "control and card radii must stay within the 2-6px classic scale");
});

test("the !important override layer is gone", async () => {
  const files = await cssFiles();
  assert.ok(
    !files.some((file) => file.name === "classic-nexora.css"),
    "classic-nexora.css was an override layer; its tokens moved to tokens.css and its print rules to print.css",
  );

  // `!important` inside @media print and @media (prefers-reduced-motion) is
  // correct: both must defeat screen styling, and the reduced-motion block is
  // an accessibility guarantee. Everything else is counted. What remains are
  // single-purpose utility and state classes (.nx-pos/.nx-neg, readonly
  // inputs, alignment helpers, the document totals rule) - not a layer.
  const stripMediaOverrides = (source) => {
    let out = "";
    let index = 0;
    const pattern = /@media[^{]*(?:print|prefers-reduced-motion)[^{]*\{/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      out += source.slice(index, match.index);
      let depth = 0;
      let cursor = match.index + match[0].length - 1;
      while (cursor < source.length) {
        if (source[cursor] === "{") depth += 1;
        else if (source[cursor] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }
      index = cursor + 1;
      pattern.lastIndex = index;
    }
    return out + source.slice(index);
  };

  const counts = files
    .map(({ name, source }) => ({
      name,
      count: (stripMediaOverrides(code(source)).match(/!important/g) ?? []).length,
    }))
    .filter((entry) => entry.count > 0);
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  assert.ok(
    total <= 16,
    `expected at most 16 non-print, non-reduced-motion !important declarations, found ${total}: ` +
      counts.map((entry) => `${entry.name}=${entry.count}`).join(", "),
  );
  assert.ok(
    !counts.some((entry) => entry.count > 6),
    "no single stylesheet may concentrate !important; that is what an override layer looks like: " +
      counts.map((entry) => `${entry.name}=${entry.count}`).join(", "),
  );
});

test("numbers are set to align in their columns", async () => {
  const files = await cssFiles();
  const all = files.map(({ source }) => source).join("\n");
  const tokens = files.find((file) => file.name === "tokens.css");

  // The root sets tabular figures for the whole interface.
  assert.match(tokens.source, /font-variant-numeric:\s*tabular-nums/, "the prototype root must request tabular figures");

  // Numeric table cells are right-aligned through both conventions: the
  // `.amount` class the table renderers emit, and the explicit `.nx-num`.
  assert.match(all, /\.amount/, "the numeric column convention must be styled");
  assert.match(all, /\.nx-num/, "an explicit numeric cell class must exist");
});

test("Tailwind is fully removed", async () => {
  const files = await cssFiles();
  assert.ok(
    !files.some(({ source }) => /@import\s+["']tailwindcss["']/.test(source)),
    "Tailwind was imported but no utility class was ever used",
  );
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["tailwindcss", "@tailwindcss/postcss"]) {
    assert.ok(!(name in deps), `${name} should not be a dependency`);
  }
});

test("globals.css carries no second design system", async () => {
  const source = code(await readFile(appDir + "globals.css", "utf8"));
  // These classes were a complete superseded design system, verified unused.
  for (const dead of [".side-rail", ".metric-card", ".app-frame", ".top-bar", ".dashboard-grid", ".module-nav"]) {
    assert.ok(!source.includes(dead), `${dead} belonged to the removed first-generation system`);
  }
  // And its rival token vocabulary.
  for (const token of ["--ink:", "--blue:", "--canvas:", "--nav:"]) {
    assert.ok(!source.includes(token), `${token} competed with the --nx-* tokens`);
  }
});

test("every designation resolves to the approved Nexora corporate palette", async () => {
  const files = await cssFiles();
  const tokens = files.find((file) => file.name === "tokens.css").source;

  const stamp = `${process.pid}-r-${Date.now()}`;
  const mockUrl = new URL("../app/mock-data.ts", import.meta.url);
  mockUrl.searchParams.set("test", stamp);
  const { roleOptions } = await import(mockUrl.href);

  assert.ok(roleOptions.length >= 19, "role-specific information and permissions must remain available");

  const lock = /\.nx-prototype\[data-role-theme\]\s*\{([^}]*)\}/.exec(tokens);
  assert.ok(lock, "a final role-neutral corporate palette lock is required");
  const approved = {
    "--nx-primary": "#183b56",
    "--nx-secondary": "#2f5d7c",
    "--nx-accent": "#4f8fbf",
    "--nx-canvas": "#f5f7fa",
    "--nx-surface": "#ffffff",
    "--nx-text": "#1f2937",
    "--nx-text-muted": "#6b7280",
    "--nx-border": "#d9e1e8",
    "--nx-success": "#2e7d5b",
    "--nx-warning": "#c58a18",
    "--nx-danger": "#c44747",
  };
  for (const [token, value] of Object.entries(approved)) {
    assert.ok(tokens.includes(`${token}: ${value}`), `approved palette is missing ${token}: ${value}`);
  }
  for (const [token, value] of Object.entries(approved).filter(([token]) => ["--nx-primary", "--nx-secondary", "--nx-accent"].includes(token))) {
    assert.ok(lock[1].includes(`${token}: ${value}`), `role palette lock is missing ${token}`);
  }
});
