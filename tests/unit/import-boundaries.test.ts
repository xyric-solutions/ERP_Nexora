import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
      }),
    )
  ).flat();
}

it("enforces dependency direction at workspace boundaries", async () => {
  const rules = [
    { directory: "packages/contracts/src", forbidden: ["@nexora/db", "@nexora/domain", "apps/"] },
    { directory: "packages/auth/src", forbidden: ["@nexora/db", "apps/"] },
    { directory: "packages/domain/src", forbidden: ["@nexora/db", "apps/"] },
    { directory: "apps/web", forbidden: ["@nexora/db", "bullmq", "ioredis", "pg"] },
    { directory: "app", forbidden: ["@nexora/db", "@nexora/domain", "bullmq", "ioredis", "pg"] },
  ];
  const violations: string[] = [];
  for (const rule of rules) {
    for (const file of await sourceFiles(resolve(root, rule.directory))) {
      const source = await readFile(file, "utf8");
      for (const specifier of rule.forbidden) {
        if (source.includes(`from "${specifier}`) || source.includes(`from '${specifier}`))
          violations.push(`${relative(root, file)} imports ${specifier}`);
      }
    }
  }
  expect(violations).toEqual([]);
});
