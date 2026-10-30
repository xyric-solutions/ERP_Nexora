import type {
  ChangeRecurringJournalStatusRequest,
  CreateJournalRequest,
  CreateRecurringJournalRequest,
  DecideJournalRequest,
  DeleteJournalRequest,
  JournalDirectoryQuery,
  RecurringJournalDirectoryQuery,
  ReverseJournalRequest,
  SubmitJournalRequest,
  UpdateJournalRequest,
  UpdateRecurringJournalRequest,
} from "@nexora/contracts";
import type { NexoraApiClient } from "@/lib/api/generated";

function query(input: Record<string, string | number | boolean | undefined>) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") values.set(key, String(value));
  const result = values.toString();
  return result ? `?${result}` : "";
}

export class FinanceJournalsClient {
  constructor(private readonly api: NexoraApiClient) {}
  options(companyId?: string) {
    return this.api.getJournalOptions(query({ company_id: companyId }));
  }
  list(input: JournalDirectoryQuery) {
    return this.api.listJournals(query(input));
  }
  detail(id: string) {
    return this.api.getJournal(id);
  }
  create(input: CreateJournalRequest, csrf: string, key: string) {
    return this.api.createJournal(input, csrf, key);
  }
  update(id: string, input: UpdateJournalRequest, csrf: string, key: string) {
    return this.api.updateJournal(id, input, csrf, key);
  }
  delete(id: string, input: DeleteJournalRequest, csrf: string, key: string) {
    return this.api.deleteJournal(id, input, csrf, key);
  }
  submit(id: string, input: SubmitJournalRequest, csrf: string, key: string) {
    return this.api.submitJournal(id, input, csrf, key);
  }
  decide(id: string, input: DecideJournalRequest, csrf: string, key: string) {
    return this.api.decideJournal(id, input, csrf, key);
  }
  reverse(id: string, input: ReverseJournalRequest, csrf: string, key: string) {
    return this.api.reverseJournal(id, input, csrf, key);
  }
  recurring(input: RecurringJournalDirectoryQuery) {
    return this.api.listRecurringJournals(query(input));
  }
  createRecurring(input: CreateRecurringJournalRequest, csrf: string, key: string) {
    return this.api.createRecurringJournal(input, csrf, key);
  }
  updateRecurring(id: string, input: UpdateRecurringJournalRequest, csrf: string, key: string) {
    return this.api.updateRecurringJournal(id, input, csrf, key);
  }
  recurringStatus(id: string, input: ChangeRecurringJournalStatusRequest, csrf: string, key: string) {
    return this.api.changeRecurringJournalStatus(id, input, csrf, key);
  }
  occurrences(id: string, input: { limit: number; cursor?: string }) {
    return this.api.listRecurringJournalOccurrences(id, query(input));
  }
}
