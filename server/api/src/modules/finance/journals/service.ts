import type { SourceFinanceJournalRepository } from "./source-repository.js";

export type FinanceJournalRepository = Pick<
  SourceFinanceJournalRepository,
  | "options"
  | "list"
  | "get"
  | "create"
  | "update"
  | "deleteDraft"
  | "submit"
  | "decide"
  | "reverse"
  | "listRecurring"
  | "createRecurring"
  | "updateRecurring"
  | "changeRecurringStatus"
  | "listOccurrences"
>;

export class FinanceJournalService {
  constructor(private readonly repository: FinanceJournalRepository) {}
  options(...args: Parameters<FinanceJournalRepository["options"]>) {
    return this.repository.options(...args);
  }
  list(...args: Parameters<FinanceJournalRepository["list"]>) {
    return this.repository.list(...args);
  }
  get(...args: Parameters<FinanceJournalRepository["get"]>) {
    return this.repository.get(...args);
  }
  create(...args: Parameters<FinanceJournalRepository["create"]>) {
    return this.repository.create(...args);
  }
  update(...args: Parameters<FinanceJournalRepository["update"]>) {
    return this.repository.update(...args);
  }
  deleteDraft(...args: Parameters<FinanceJournalRepository["deleteDraft"]>) {
    return this.repository.deleteDraft(...args);
  }
  submit(...args: Parameters<FinanceJournalRepository["submit"]>) {
    return this.repository.submit(...args);
  }
  decide(...args: Parameters<FinanceJournalRepository["decide"]>) {
    return this.repository.decide(...args);
  }
  reverse(...args: Parameters<FinanceJournalRepository["reverse"]>) {
    return this.repository.reverse(...args);
  }
  listRecurring(...args: Parameters<FinanceJournalRepository["listRecurring"]>) {
    return this.repository.listRecurring(...args);
  }
  createRecurring(...args: Parameters<FinanceJournalRepository["createRecurring"]>) {
    return this.repository.createRecurring(...args);
  }
  updateRecurring(...args: Parameters<FinanceJournalRepository["updateRecurring"]>) {
    return this.repository.updateRecurring(...args);
  }
  changeRecurringStatus(...args: Parameters<FinanceJournalRepository["changeRecurringStatus"]>) {
    return this.repository.changeRecurringStatus(...args);
  }
  listOccurrences(...args: Parameters<FinanceJournalRepository["listOccurrences"]>) {
    return this.repository.listOccurrences(...args);
  }
}
