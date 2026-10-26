import type {
  BankTransferDirectoryQuery,
  BankTransferOptionsQuery,
  BankWorkflowOptionQuery,
  CreateBankTransferRequest,
  DecideBankTransferRequest,
  PostBankTransferRequest,
  ReassignBankApproverRequest,
  ReverseBankTransferRequest,
  SubmitBankTransferRequest,
  UpdateBankTransferRequest,
} from "@nexora/contracts";
import type { BankingActorContext } from "../source-repository.js";
import type { SourceBankTransferRepository } from "./source-repository.js";

export type BankingTransferRepository = Pick<
  SourceBankTransferRepository,
  | "list"
  | "options"
  | "workflowOptions"
  | "get"
  | "create"
  | "update"
  | "submit"
  | "decide"
  | "post"
  | "reverse"
  | "reassign"
>;
export class BankingTransferService {
  constructor(private readonly repository: BankingTransferRepository) {}
  list(context: BankingActorContext, query: BankTransferDirectoryQuery) {
    return this.repository.list(context, query);
  }
  options(context: BankingActorContext, query: BankTransferOptionsQuery) {
    return this.repository.options(context, query);
  }
  workflowOptions(context: BankingActorContext, query: BankWorkflowOptionQuery) {
    return this.repository.workflowOptions(context, query);
  }
  get(context: BankingActorContext, id: string) {
    return this.repository.get(context, id);
  }
  create(context: BankingActorContext, input: CreateBankTransferRequest, key: string, correlation: string) {
    return this.repository.create(context, input, key, correlation);
  }
  update(context: BankingActorContext, id: string, input: UpdateBankTransferRequest, key: string, correlation: string) {
    return this.repository.update(context, id, input, key, correlation);
  }
  submit(context: BankingActorContext, id: string, input: SubmitBankTransferRequest, key: string, correlation: string) {
    return this.repository.submit(context, id, input, key, correlation);
  }
  decide(context: BankingActorContext, id: string, input: DecideBankTransferRequest, key: string, correlation: string) {
    return this.repository.decide(context, id, input, key, correlation);
  }
  reassign(
    context: BankingActorContext,
    id: string,
    input: ReassignBankApproverRequest,
    key: string,
    correlation: string,
  ) {
    return this.repository.reassign(context, id, input, key, correlation);
  }
  post(context: BankingActorContext, id: string, input: PostBankTransferRequest, key: string, correlation: string) {
    return this.repository.post(context, id, input, key, correlation);
  }
  reverse(
    context: BankingActorContext,
    id: string,
    input: ReverseBankTransferRequest,
    key: string,
    correlation: string,
  ) {
    return this.repository.reverse(context, id, input, key, correlation);
  }
}
