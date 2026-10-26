import type { SourceReferenceMasterRepository } from "./source-repository.js";
export type ReferenceMasterRepository = Pick<
  SourceReferenceMasterRepository,
  "companies" | "list" | "get" | "create" | "update" | "status"
>;
export class ReferenceMasterService {
  constructor(private readonly repository: ReferenceMasterRepository) {}
  companies(...args: Parameters<ReferenceMasterRepository["companies"]>) {
    return this.repository.companies(...args);
  }
  list(...args: Parameters<ReferenceMasterRepository["list"]>) {
    return this.repository.list(...args);
  }
  get(...args: Parameters<ReferenceMasterRepository["get"]>) {
    return this.repository.get(...args);
  }
  create(...args: Parameters<ReferenceMasterRepository["create"]>) {
    return this.repository.create(...args);
  }
  update(...args: Parameters<ReferenceMasterRepository["update"]>) {
    return this.repository.update(...args);
  }
  status(...args: Parameters<ReferenceMasterRepository["status"]>) {
    return this.repository.status(...args);
  }
}
