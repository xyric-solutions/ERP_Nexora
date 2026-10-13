/**
 * Accessibility gate for the prototype.
 *
 * The main Nexora web app runs dedicated axe checks; this prototype had none,
 * so a regression here was invisible. This renders the built worker, loads the
 * markup into jsdom and runs axe-core over it.
 *
 * Scope and honesty note: jsdom does no layout, so axe cannot evaluate
 * `color-contrast` here - that rule is disabled explicitly rather than left to
 * fail silently, and contrast remains a manual check in a real browser. Every
 * other applicable WCAG 2 A/AA rule is enforced. This also only covers the
 * server-rendered entry screen; hash-routed screens render client-side and are
 * outside what this harness can reach.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import axe from "axe-core";

async function renderedHtml() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `a11y-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  return response.text();
}

test("the rendered prototype has no axe accessibility violations", async () => {
  const html = await renderedHtml();
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    // axe is injected into the page, so the window needs script evaluation.
    runScripts: "outside-only",
  });
  const { window } = dom;

  window.eval(axe.source);
  const results = await window.axe.run(window.document, {
    resultTypes: ["violations"],
    rules: {
      // jsdom performs no layout, so contrast cannot be computed here.
      "color-contrast": { enabled: false },
    },
  });

  // `results` crosses back from the jsdom realm, so its arrays carry jsdom's
  // Array prototype. Array.from rebuilds them in this realm; without it a
  // passing run still fails deepStrictEqual on the prototype comparison.
  const summary = Array.from(
    results.violations,
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n    ` +
      violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join("\n    "),
  );

  assert.deepEqual(
    summary,
    [],
    `axe reported ${results.violations.length} violation(s):\n  ${summary.join("\n  ")}`,
  );
  dom.window.close();
});

test("the rendered prototype keeps its document landmarks and labelling", async () => {
  const html = await renderedHtml();
  const dom = new JSDOM(html, { url: "http://localhost/" });
  const { document } = dom.window;

  // Structural expectations that axe cannot assert on its own.
  assert.equal(document.documentElement.getAttribute("lang"), "en", "the page must declare a language");
  assert.ok(document.querySelector("main, [role='main']"), "a main landmark is required");
  assert.ok(document.querySelector("nav, [role='navigation']"), "a navigation landmark is required");

  const headings = [...document.querySelectorAll("h1")];
  assert.ok(headings.length >= 1, "the page needs a level-one heading");

  // Every control a reviewer can operate must carry an accessible name.
  const controls = [...document.querySelectorAll("button, select, input:not([type='hidden'])")];
  assert.ok(controls.length > 20, "the shell should render its full control set");
  const unnamed = controls.filter((el) => {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return false;
    if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
    if (el.closest("label")) return false;
    return (el.textContent ?? "").trim().length === 0;
  });
  assert.deepEqual(
    unnamed.map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`),
    [],
    "every button, select and input needs an accessible name",
  );

  // Images must be described or explicitly decorative.
  const images = [...document.querySelectorAll("img")];
  const undescribed = images.filter((img) => img.getAttribute("alt") === null && img.getAttribute("role") !== "presentation");
  assert.deepEqual(undescribed.map((img) => img.getAttribute("src")), [], "images need alt text");

  dom.window.close();
});
