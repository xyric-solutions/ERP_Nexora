import type { SourceFinanceNominalRepository } from "./source-repository.js";

export type FinanceNominalRepository = Pick<
  SourceFinanceNominalRepository,
  "options" | "list" | "get" | "create" | "update" | "submit" | "decide" | "changeStatus"
>;

/** Feature boundary shared by API callers; repository owns its SQL transaction. */
export class FinanceNominalService {
  constructor(private readonly repository: FinanceNominalRepository) {}
  options(...args: Parameters<FinanceNominalRepository["options"]>) {
    return this.repository.options(...args);
  }
  list(...args: Parameters<FinanceNominalRepository["list"]>) {
    return this.repository.list(...args);
  }
  get(...args: Parameters<FinanceNominalRepository["get"]>) {
    return this.repository.get(...args);
  }
  create(...args: Parameters<FinanceNominalRepository["create"]>) {
    return this.repository.create(...args);
  }
  update(...args: Parameters<FinanceNominalRepository["update"]>) {
    return this.repository.update(...args);
  }
  submit(...args: Parameters<FinanceNominalRepository["submit"]>) {
    return this.repository.submit(...args);
  }
  decide(...args: Parameters<FinanceNominalRepository["decide"]>) {
    return this.repository.decide(...args);
  }
  changeStatus(...args: Parameters<FinanceNominalRepository["changeStatus"]>) {
    return this.repository.changeStatus(...args);
  }
}
