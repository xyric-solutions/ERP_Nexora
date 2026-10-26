import type {
  AdoptCurrencyRequest,
  ChangeCurrencyRateStatusRequest,
  ChangeCurrencyStatusRequest,
  CorrectCurrencyRateRequest,
  ActivateCompanyCurrencyRequest,
  ChangeCompanyCurrencyStatusRequest,
  ChangeCompanyCurrencyRateStatusRequest,
  CompanyCurrencyDirectoryQuery,
  CompanyCurrencyRateDirectoryQuery,
  ConfigureCompanyCurrencyProfileRequest,
  CorrectCompanyCurrencyRateRequest,
  CountryCurrencyDirectoryQuery,
  CreateCompanyCurrencyRateRequest,
  CreateCurrencyRateRequest,
  CurrencyCatalogQuery,
  CurrencyRateQuery,
  TenantCurrencyQuery,
  UpsertTransferFxPolicyRequest,
} from "@nexora/contracts";
import type { NexoraApiClient } from "@/lib/api/generated";

function query(input: Record<string, string | number | boolean | undefined>) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") values.set(key, String(value));
  const result = values.toString();
  return result ? `?${result}` : "";
}

export class FinanceCurrenciesClient {
  constructor(private readonly api: NexoraApiClient) {}
  catalog(input: CurrencyCatalogQuery) {
    return this.api.listCurrencyCatalog(query(input));
  }
  currencies(input: TenantCurrencyQuery) {
    return this.api.listTenantCurrencies(query(input));
  }
  adopt(input: AdoptCurrencyRequest, csrf: string, key: string) {
    return this.api.adoptCurrency(input, csrf, key);
  }
  changeCurrency(code: string, input: ChangeCurrencyStatusRequest, csrf: string, key: string) {
    return this.api.changeCurrencyStatus(code, input, csrf, key);
  }
  rates(input: CurrencyRateQuery) {
    return this.api.listCurrencyRates(query(input));
  }
  createRate(input: CreateCurrencyRateRequest, csrf: string, key: string) {
    return this.api.createCurrencyRate(input, csrf, key);
  }
  correctRate(id: string, input: CorrectCurrencyRateRequest, csrf: string, key: string) {
    return this.api.correctCurrencyRate(id, input, csrf, key);
  }
  changeRate(id: string, input: ChangeCurrencyRateStatusRequest, csrf: string, key: string) {
    return this.api.changeCurrencyRateStatus(id, input, csrf, key);
  }
  policy(companyId: string) {
    return this.api.getTransferFxPolicy(query({ company_id: companyId }));
  }
  savePolicy(input: UpsertTransferFxPolicyRequest, csrf: string, key: string) {
    return this.api.upsertTransferFxPolicy(input, csrf, key);
  }
  countries(input: CountryCurrencyDirectoryQuery) {
    return this.api.listCountryCurrencies(query(input));
  }
  profile(companyId: string) {
    return this.api.getCompanyCurrencyProfile(companyId);
  }
  configureProfile(companyId: string, input: ConfigureCompanyCurrencyProfileRequest, csrf: string, key: string) {
    return this.api.configureCompanyCurrencyProfile(companyId, input, csrf, key);
  }
  companyCurrencies(input: CompanyCurrencyDirectoryQuery) {
    return this.api.listCompanyCurrencies(query(input));
  }
  activateCompanyCurrency(input: ActivateCompanyCurrencyRequest, csrf: string, key: string) {
    return this.api.activateCompanyCurrency(input, csrf, key);
  }
  changeCompanyCurrency(
    companyId: string,
    code: string,
    input: ChangeCompanyCurrencyStatusRequest,
    csrf: string,
    key: string,
  ) {
    return this.api.changeCompanyCurrencyStatus(companyId, code, input, csrf, key);
  }
  companyRates(input: CompanyCurrencyRateDirectoryQuery) {
    return this.api.listCompanyCurrencyRates(query(input));
  }
  createCompanyRate(input: CreateCompanyCurrencyRateRequest, csrf: string, key: string) {
    return this.api.createCompanyCurrencyRate(input, csrf, key);
  }
  correctCompanyRate(id: string, input: CorrectCompanyCurrencyRateRequest, csrf: string, key: string) {
    return this.api.correctCompanyCurrencyRate(id, input, csrf, key);
  }
  changeCompanyRate(id: string, input: ChangeCompanyCurrencyRateStatusRequest, csrf: string, key: string) {
    return this.api.changeCompanyCurrencyRateStatus(id, input, csrf, key);
  }
}
