const localDatabaseHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const isolatedDatabaseName = /(uat|test|codex|isolated|postmerge)/i;

export function isExplicitlyNamedLocalUatDatabase(databaseUrl: string): boolean {
  try {
    const target = new URL(databaseUrl);
    return localDatabaseHosts.has(target.hostname) && isolatedDatabaseName.test(decodeURIComponent(target.pathname));
  } catch {
    return false;
  }
}
