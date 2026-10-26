import type { SourceFinanceCurrencyRepository } from "./source-repository.js";

export type FinanceCurrencyRepository = Pick<
  SourceFinanceCurrencyRepository,
  | "listCatalog"
  | "listCurrencies"
  | "adopt"
  | "changeCurrencyStatus"
  | "listRates"
  | "createRate"
  | "correctRate"
  | "changeRateStatus"
  | "getPolicy"
  | "upsertPolicy"
  | "listCountryCurrencies"
  | "getCompanyCurrencyProfile"
  | "configureCompanyCurrencyProfile"
  | "listCompanyCurrencies"
  | "activateCompanyCurrency"
  | "changeCompanyCurrencyStatus"
  | "listCompanyCurrencyRates"
  | "createCompanyCurrencyRate"
  | "correctCompanyCurrencyRate"
  | "changeCompanyCurrencyRateStatus"
  | "resolveCompanyCurrencyRate"
>;

export class FinanceCurrencyService {
  constructor(private readonly repository: FinanceCurrencyRepository) {}
  listCatalog(...args: Parameters<FinanceCurrencyRepository["listCatalog"]>) {
    return this.repository.listCatalog(...args);
  }
  listCurrencies(...args: Parameters<FinanceCurrencyRepository["listCurrencies"]>) {
    return this.repository.listCurrencies(...args);
  }
  adopt(...args: Parameters<FinanceCurrencyRepository["adopt"]>) {
    return this.repository.adopt(...args);
  }
  changeCurrencyStatus(...args: Parameters<FinanceCurrencyRepository["changeCurrencyStatus"]>) {
    return this.repository.changeCurrencyStatus(...args);
  }
  listRates(...args: Parameters<FinanceCurrencyRepository["listRates"]>) {
    return this.repository.listRates(...args);
  }
  createRate(...args: Parameters<FinanceCurrencyRepository["createRate"]>) {
    return this.repository.createRate(...args);
  }
  correctRate(...args: Parameters<FinanceCurrencyRepository["correctRate"]>) {
    return this.repository.correctRate(...args);
  }
  changeRateStatus(...args: Parameters<FinanceCurrencyRepository["changeRateStatus"]>) {
    return this.repository.changeRateStatus(...args);
  }
  getPolicy(...args: Parameters<FinanceCurrencyRepository["getPolicy"]>) {
    return this.repository.getPolicy(...args);
  }
  upsertPolicy(...args: Parameters<FinanceCurrencyRepository["upsertPolicy"]>) {
    return this.repository.upsertPolicy(...args);
  }
  listCountryCurrencies(...args: Parameters<FinanceCurrencyRepository["listCountryCurrencies"]>) {
    return this.repository.listCountryCurrencies(...args);
  }
  getCompanyCurrencyProfile(...args: Parameters<FinanceCurrencyRepository["getCompanyCurrencyProfile"]>) {
    return this.repository.getCompanyCurrencyProfile(...args);
  }
  configureCompanyCurrencyProfile(...args: Parameters<FinanceCurrencyRepository["configureCompanyCurrencyProfile"]>) {
    return this.repository.configureCompanyCurrencyProfile(...args);
  }
  listCompanyCurrencies(...args: Parameters<FinanceCurrencyRepository["listCompanyCurrencies"]>) {
    return this.repository.listCompanyCurrencies(...args);
  }
  activateCompanyCurrency(...args: Parameters<FinanceCurrencyRepository["activateCompanyCurrency"]>) {
    return this.repository.activateCompanyCurrency(...args);
  }
  changeCompanyCurrencyStatus(...args: Parameters<FinanceCurrencyRepository["changeCompanyCurrencyStatus"]>) {
    return this.repository.changeCompanyCurrencyStatus(...args);
  }
  listCompanyCurrencyRates(...args: Parameters<FinanceCurrencyRepository["listCompanyCurrencyRates"]>) {
    return this.repository.listCompanyCurrencyRates(...args);
  }
  createCompanyCurrencyRate(...args: Parameters<FinanceCurrencyRepository["createCompanyCurrencyRate"]>) {
    return this.repository.createCompanyCurrencyRate(...args);
  }
  correctCompanyCurrencyRate(...args: Parameters<FinanceCurrencyRepository["correctCompanyCurrencyRate"]>) {
    return this.repository.correctCompanyCurrencyRate(...args);
  }
  changeCompanyCurrencyRateStatus(...args: Parameters<FinanceCurrencyRepository["changeCompanyCurrencyRateStatus"]>) {
    return this.repository.changeCompanyCurrencyRateStatus(...args);
  }
  resolveCompanyCurrencyRate(...args: Parameters<FinanceCurrencyRepository["resolveCompanyCurrencyRate"]>) {
    return this.repository.resolveCompanyCurrencyRate(...args);
  }
}
