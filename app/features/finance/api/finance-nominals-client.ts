import type { FinanceNominalDirectoryQuery } from "@nexora/contracts";
import type { NexoraApiClient } from "@/lib/api/generated";

export class FinanceNominalsClient {
  constructor(readonly api: NexoraApiClient) {}
  options(companyId?: string) {
    return this.api.listFinanceNominalOptions(companyId ? `?${new URLSearchParams({ company_id: companyId })}` : "");
  }
  list(input: FinanceNominalDirectoryQuery) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined && value !== "") query.set(key, String(value));
    return this.api.listFinanceNominals(`?${query}`);
  }
}
