import type { ChartTemplateNodeQuery, ChartTemplateNodes } from "@nexora/contracts";
import type { NexoraApiClient } from "@/lib/api/generated";

export class ChartTemplatesClient {
  constructor(private readonly api: NexoraApiClient) {}
  revisions(cursor?: string) {
    return this.api.listChartTemplates(`?${new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) })}`);
  }
  nodes(id: string, input: ChartTemplateNodeQuery) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined && value !== "") query.set(key, String(value));
    return this.api.listChartTemplateNodes(id, `?${query}`);
  }
  async headers(id: string, kind: "category" | "section") {
    const result: ChartTemplateNodes["items"] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    // Contract bounds: at most 100 categories or 1,000 sections per revision.
    for (let page = 0; page < 10; page++) {
      const response = await this.nodes(id, { kind, limit: 100, ...(cursor ? { cursor } : {}) });
      result.push(...response.items);
      if (!response.next_cursor) return result;
      if (seen.has(response.next_cursor)) throw new Error("Repeated template metadata cursor.");
      seen.add(response.next_cursor);
      cursor = response.next_cursor;
    }
    throw new Error("Template metadata exceeds its supported bounds.");
  }
}
