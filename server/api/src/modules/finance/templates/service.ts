import type { SourceChartTemplateRepository } from "./source-repository.js";
export type ChartTemplateRepository = Pick<
  SourceChartTemplateRepository,
  "list" | "get" | "nodes" | "import" | "publish" | "companyPreview" | "adoptCompany" | "classifyNominal"
>;
export class ChartTemplateService {
  constructor(private readonly repository: ChartTemplateRepository) {}
  adoptCompany(...args: Parameters<ChartTemplateRepository["adoptCompany"]>) {
    return this.repository.adoptCompany(...args);
  }
  classifyNominal(...args: Parameters<ChartTemplateRepository["classifyNominal"]>) {
    return this.repository.classifyNominal(...args);
  }
  list(...args: Parameters<ChartTemplateRepository["list"]>) {
    return this.repository.list(...args);
  }
  get(...args: Parameters<ChartTemplateRepository["get"]>) {
    return this.repository.get(...args);
  }
  nodes(...args: Parameters<ChartTemplateRepository["nodes"]>) {
    return this.repository.nodes(...args);
  }
  import(...args: Parameters<ChartTemplateRepository["import"]>) {
    return this.repository.import(...args);
  }
  publish(...args: Parameters<ChartTemplateRepository["publish"]>) {
    return this.repository.publish(...args);
  }
  companyPreview(...args: Parameters<ChartTemplateRepository["companyPreview"]>) {
    return this.repository.companyPreview(...args);
  }
}
