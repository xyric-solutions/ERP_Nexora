/**
 * Design-system gate.
 *
 * The prototype's look was previously held together by four competing token
 * declarations and an `!important` override layer, with 484 font-size
 * declarations at or below 12px (table headers were 8px). That was fixed by
 * separating colors, typography, and geometry into dedicated token files and
 * normalizing the component CSS.
 *
 * These checks keep it fixed. They are deliberately mechanical: each one
 * corresponds to a specific defect that shipped once already.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const webDir = fileURLToPath(new URL("../", import.meta.url));

async function sourceFiles(root, extensions) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".next" || entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (extensions.has(extname(entry.name))) {
        found.push({
          name: relative(repositoryRoot, path).replaceAll("\\", "/"),
          source: await readFile(path, "utf8"),
        });
      }
    }
  }
  await visit(root);
  return found;
}

async function cssFiles() {
  const entries = await readdir(appDir);
  const names = entries.filter((name) => name.endsWith(".css"));
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(appDir + name, "utf8") })));
}

/** Strip comments so documentation prose never trips a source check. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarationBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  assert.fail(`unclosed block for ${selector}`);
}

function customProperties(block) {
  return new Map([...block.matchAll(/(--nx-[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [match[1], match[2].trim()]));
}

test("design token responsibilities remain separated", async () => {
  const files = await cssFiles();
  // Global tokens declared on the prototype root belong only to the three
  // dedicated layers. Component-scoped locals remain with their component.
  const definers = files
    .filter(({ source }) => /\.nx-prototype[^{]*\{[^}]*--nx-[a-z0-9-]+\s*:/s.test(code(source)))
    .map(({ name }) => name);
  assert.deepEqual(
    definers.sort(),
    ["theme-colors.css", "tokens.css", "typography.css"],
    "prototype-level tokens must stay in the dedicated color, geometry, and typography layers",
  );

  const tokens = files.find((file) => file.name === "tokens.css");
  const colors = files.find((file) => file.name === "theme-colors.css");
  const typography = files.find((file) => file.name === "typography.css");
  assert.ok(tokens, "tokens.css must exist");
  assert.ok(colors, "theme-colors.css must exist");
  assert.ok(typography, "typography.css must exist");

  for (const required of ["--nx-radius-sm", "--nx-shadow-xs", "--nx-sidebar-width"]) {
    assert.ok(tokens.source.includes(required), `tokens.css must define ${required}`);
  }
  for (const required of ["--nx-brand", "--nx-canvas", "--nx-text-strong", "--nx-series-1"]) {
    assert.ok(colors.source.includes(required), `theme-colors.css must define ${required}`);
  }
  for (const required of ["--nx-size-micro", "--nx-size-body", "--nx-size-page", "--nx-font-serif"]) {
    assert.ok(typography.source.includes(required), `typography.css must define ${required}`);
  }

  assert.doesNotMatch(
    code(tokens.source),
    /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
    "tokens.css must not own literal colors",
  );
  assert.match(colors.source, /:root\[data-theme="dark"\]/, "dark theme colors belong in theme-colors.css");
  assert.match(colors.source, /@media print/, "print colors belong in theme-colors.css");
  assert.match(tokens.source, /\[data-density="compact"\]/, "density tokens belong in tokens.css");
});

test("production route styles consume centralized semantic colors", async () => {
  const styleUrls = [
    new URL("../app/login/login.module.css", import.meta.url),
    new URL("../app/features/security/identity-workspace.module.css", import.meta.url),
    new URL("../app/features/security/users/user-management.module.css", import.meta.url),
  ];
  for (const url of styleUrls) {
    const source = code(await readFile(url, "utf8"));
    assert.doesNotMatch(
      source,
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      `${fileURLToPath(url)} must use semantic theme variables instead of a local palette`,
    );
  }
});

test("theme-colors.css is the only application palette owner", async () => {
  const files = [
    ...(await sourceFiles(appDir, new Set([".css", ".ts", ".tsx"]))),
    ...(await sourceFiles(webDir, new Set([".css", ".ts", ".tsx"]))),
  ];
  const colorLiteral = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
  const offenders = files
    .filter(({ name }) => name !== "app/theme-colors.css")
    .filter(({ source }) => colorLiteral.test(code(source)))
    .map(({ name }) => name);

  assert.deepEqual(
    offenders,
    [],
    "application colors must be defined once in app/theme-colors.css and consumed through semantic variables",
  );
});

test("light and dark themes expose the same centralized color contract", async () => {
  const source = code(await readFile(appDir + "theme-colors.css", "utf8"));
  const light = customProperties(declarationBlock(source, ':root[data-theme="light"]'));
  const dark = customProperties(declarationBlock(source, ':root[data-theme="dark"]'));
  assert.deepEqual(
    [...dark.keys()].sort(),
    [...light.keys()].sort(),
    "light and dark theme token names must stay in parity",
  );

  for (const token of ["--nx-paper", "--nx-paper-ink", "--nx-paper-muted", "--nx-paper-border", "--nx-paper-rule"]) {
    assert.equal(dark.get(token), light.get(token), `${token} must remain fixed for legal and printable documents`);
  }
});

test("font families are owned by typography.css", async () => {
  const files = [...(await sourceFiles(appDir, new Set([".css"]))), ...(await sourceFiles(webDir, new Set([".css"])))];
  const offenders = [];
  for (const { name, source } of files) {
    if (name === "app/typography.css") continue;
    for (const match of code(source).matchAll(/font-family:\s*([^;}]+)/gi)) {
      if (!/^var\(--nx-font-[a-z0-9-]+\)$/i.test(match[1].trim())) {
        offenders.push(`${name}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "component styles must consume centralized --nx-font-* families");
});

test("every application theme variable reference has a definition", async () => {
  const files = [
    ...(await sourceFiles(appDir, new Set([".css", ".ts", ".tsx"]))),
    ...(await sourceFiles(webDir, new Set([".css", ".ts", ".tsx"]))),
  ];
  const definitions = new Set();
  const references = new Set();
  for (const { source } of files) {
    const stripped = code(source);
    for (const match of stripped.matchAll(/["']?(--nx-[a-z0-9-]+)["']?\s*:/gi)) definitions.add(match[1]);
    for (const match of stripped.matchAll(/var\((--nx-[a-z0-9-]+)\s*\)/gi)) references.add(match[1]);
  }
  const missing = [...references].filter((token) => !definitions.has(token)).sort();
  assert.deepEqual(missing, [], "all --nx-* references must resolve to a centralized or component-local definition");
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
  const typography = files.find((file) => file.name === "typography.css");

  // The root sets tabular figures for the whole interface.
  assert.match(
    typography.source,
    /font-variant-numeric:\s*tabular-nums/,
    "the prototype root must request tabular figures",
  );

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
  const colors = files.find((file) => file.name === "theme-colors.css").source;

  const stamp = `${process.pid}-r-${Date.now()}`;
  const mockUrl = new URL("../app/mock-data.ts", import.meta.url);
  mockUrl.searchParams.set("test", stamp);
  const { roleOptions } = await import(mockUrl.href);

  assert.ok(roleOptions.length >= 19, "role-specific information and permissions must remain available");

  const lock = /\.nx-prototype\[data-role-theme\]\s*\{([^}]*)\}/.exec(colors);
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
    "--nx-warning": "#8a5a0c",
    "--nx-danger": "#b33d45",
  };
  for (const [token, value] of Object.entries(approved)) {
    assert.ok(colors.includes(`${token}: ${value}`), `approved palette is missing ${token}: ${value}`);
  }
  for (const [token, value] of Object.entries(approved).filter(([token]) =>
    ["--nx-primary", "--nx-secondary", "--nx-accent"].includes(token),
  )) {
    assert.ok(lock[1].includes(`${token}: ${value}`), `role palette lock is missing ${token}`);
  }
});
