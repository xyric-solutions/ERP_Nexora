import type { HrMasterDirectory, HrMasterDirectoryQuery } from "@nexora/contracts";

import type { HrActorContext, SourceHrRepository } from "../source-repository.js";

/** HR master-data use-cases are separate from employee workflows and payroll. */
export class HrMasterService {
  constructor(private readonly repository: Pick<SourceHrRepository, "listMasters">) {}

  list(context: HrActorContext, query: HrMasterDirectoryQuery): Promise<HrMasterDirectory> {
    return this.repository.listMasters(context, query);
  }
}
