import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  FinancePostingService,
  convertFinanceAmountToBase,
  hashFinanceValue,
  parseFinanceDecimal,
} from "../../server/api/src/modules/finance/posting/service.js";
import type {
  FinanceEventRow,
  FinanceJournalLineRow,
  FinanceJournalRow,
  FinancePostingRepository,
} from "../../server/api/src/modules/finance/posting/source-repository.js";
import {
  FinancePostingError,
  createFinanceTransactionClient,
  type FinancePostCommand,
  type FinanceReverseCommand,
  type FinanceTransactionClient,
} from "../../server/api/src/modules/finance/posting/types.js";

let client: FinanceTransactionClient;

beforeAll(async () => {
  client = await createFinanceTransactionClient({
    query: vi.fn(async (statement: string) => ({
      rows: statement.includes("current_setting") ? [{ active: true }] : [],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    })) as FinanceTransactionClient["query"],
  });
});

function command(overrides: Partial<FinancePostCommand> = {}): FinancePostCommand {
  return {
    tenantId: "tenant-a",
    companyId: "company-a",
    actorId: "actor-a",
    postingDate: "2026-10-19",
    sourceType: "banking.payment",
    sourceId: "payment-a",
    eventType: "bank_payment.posted",
    externalIdempotencyKey: "payment-a-post",
    transactionCurrency: "USD",
    exchangeRateId: null,
    exchangeRateValue: "1",
    payloadHashMaterial: { payment_version: 4 },
    lines: [
      {
        accountId: "expense-a",
        debit: "10.00",
        credit: "0",
        dimensions: { department: "finance" },
        description: "Supplier settlement",
      },
      {
        accountId: "bank-a",
        debit: "0",
        credit: "10.00",
        dimensions: {},
        description: "Bank control",
      },
    ],
    ...overrides,
  };
}

function reversalCommand(overrides: Partial<FinanceReverseCommand> = {}): FinanceReverseCommand {
  return {
    tenantId: "tenant-a",
    companyId: "company-a",
    actorId: "actor-b",
    sourceType: "banking.payment",
    sourceId: "payment-a",
    eventType: "bank_payment.reversed",
    originalEventType: "bank_payment.posted",
    externalIdempotencyKey: "payment-a-reverse",
    transactionCurrency: "USD",
    payloadHashMaterial: { reason_hash: "reason-a" },
    originalAccountingEventId: "event-original",
    originalJournalId: "journal-original",
    ...overrides,
  };
}

function originalPosting(): {
  event: FinanceEventRow;
  journal: FinanceJournalRow;
  lines: FinanceJournalLineRow[];
} {
  return {
    event: {
      id: "event-original",
      source_type: "banking.payment",
      source_id: "payment-a",
      event_type: "bank_payment.posted",
      payload: {
        operation: "post",
        resolved: {
          base_currency: "USD",
          exchange_rate_id: null,
          exchange_rate: "1.000000000000000000",
          period_id: "period-original",
          posting_date: "2026-10-18",
          transaction_currency: "USD",
        },
      },
      payload_hash: "a".repeat(64),
      idempotency_key: `fin:${"b".repeat(64)}`,
      state: "posted",
      compensates_event_id: null,
    },
    journal: {
      id: "journal-original",
      company_id: "company-a",
      posting_date: "2026-10-18",
      period_id: "period-original",
      source_type: "accounting_event",
      source_id: "event-original",
      status: "posted",
      entry_number: "JE-2026-10-00000001",
      reverses_journal_id: null,
      reversed_by_journal_id: null,
    },
    lines: [
      {
        line_number: 1,
        account_id: "expense-a",
        debit: "10.00000000",
        credit: "0.00000000",
        currency: "USD",
        fx_rate: null,
        base_debit: "10.00000000",
        base_credit: "0.00000000",
        dimensions: { department: "finance" },
      },
      {
        line_number: 2,
        account_id: "bank-a",
        debit: "0.00000000",
        credit: "10.00000000",
        currency: "USD",
        fx_rate: null,
        base_debit: "0.00000000",
        base_credit: "10.00000000",
        dimensions: {},
      },
    ],
  };
}

function repository(overrides: Partial<FinancePostingRepository> = {}): FinancePostingRepository {
  const calls: string[] = [];
  const value = {
    assertTenantContext: vi.fn(async () => true),
    lockSource: vi.fn(async () => {
      calls.push("lock-source");
    }),
    findEventByKey: vi.fn(async () => null),
    findSourceEvent: vi.fn(async () => null),
    loadBaseCurrencies: vi.fn(async () => [{ code: "USD", decimal_places: 2 }]),
    loadTransactionCurrency: vi.fn(async () => ({ code: "USD", decimal_places: 2 })),
    loadDirectRate: vi.fn(async () => null),
    lockRateAuthority: vi.fn(async () => undefined),
    loadCurrentDate: vi.fn(async () => "2026-10-19"),
    loadPeriods: vi.fn(async () => [
      { id: "period-a", status: "open", period_number: 10, fiscal_year: 2026 },
    ]),
    loadAccounts: vi.fn(async () => [
      {
        id: "expense-a",
        status: "active",
        is_header: false,
        manual_posting_allowed: true,
        required_dimensions: ["department"],
      },
      {
        id: "bank-a",
        status: "active",
        is_header: false,
        manual_posting_allowed: true,
        required_dimensions: [],
      },
    ]),
    insertEvent: vi.fn(async () => {
      calls.push("insert-event");
      return "event-a";
    }),
    transitionEvent: vi.fn(async (_client, _tenant, _event, from, to) => {
      calls.push(`event-${from}-${to}`);
    }),
    allocateEntryNumber: vi.fn(async () => {
      calls.push("allocate-number");
      return "JE-2026-10-00000001";
    }),
    insertDraftJournal: vi.fn(async () => {
      calls.push("insert-journal");
      return "journal-a";
    }),
    insertJournalLines: vi.fn(async () => {
      calls.push("insert-lines");
    }),
    postJournal: vi.fn(async () => {
      calls.push("post-journal");
    }),
    findJournalByEvent: vi.fn(async () => null),
    loadOriginalPosting: vi.fn(async () => null),
    markOriginalReversed: vi.fn(async () => undefined),
    ...overrides,
  } as FinancePostingRepository;
  Object.defineProperty(value, "__calls", { value: calls });
  return value;
}

function callsOf(value: FinancePostingRepository): string[] {
  return (value as FinancePostingRepository & { __calls: string[] }).__calls;
}

describe("Finance posting fixed-scale arithmetic", () => {
  it("parses the numeric(38,8) boundary without binary floating point", () => {
    expect(
      parseFinanceDecimal("999999999999999999999999999999.99999999", {
        fractionalDigits: 8,
        integerDigits: 30,
        allowZero: false,
      }),
    ).toMatchObject({
      canonical: "999999999999999999999999999999.99999999",
      scaled: 99999999999999999999999999999999999999n,
    });
    expect(() =>
      parseFinanceDecimal("1000000000000000000000000000000", {
        fractionalDigits: 8,
        integerDigits: 30,
        allowZero: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "FINANCE_NUMERIC_OUT_OF_RANGE" }));
    expect(() =>
      parseFinanceDecimal("1e2", { fractionalDigits: 8, integerDigits: 30, allowZero: false }),
    ).toThrowError(expect.objectContaining({ code: "FINANCE_AMOUNT_INVALID" }));
  });

  it("rounds converted positive amounts half up at the configured base scale", () => {
    const amount = parseFinanceDecimal("1.00", {
      fractionalDigits: 8,
      integerDigits: 30,
      allowZero: false,
    });
    const rate = parseFinanceDecimal("1.005000000000000000", {
      fractionalDigits: 18,
      integerDigits: 20,
      allowZero: false,
    });
    expect(convertFinanceAmountToBase(amount.scaled, rate.scaled, 2)).toBe(101000000n);
  });

  it("canonicalizes object keys before hashing", () => {
    expect(hashFinanceValue({ b: 2, a: { d: "four", c: "three" } })).toBe(
      hashFinanceValue({ a: { c: "three", d: "four" }, b: 2 }),
    );
  });
});

describe("FinancePostingService", () => {
  it("uses the exact received -> validated -> posted sequence", async () => {
    const source = repository();
    const result = await new FinancePostingService(source).post(client, command());
    expect(result).toMatchObject({
      accountingEventId: "event-a",
      journalId: "journal-a",
      entryNumber: "JE-2026-10-00000001",
      periodId: "period-a",
      replayed: false,
    });
    expect(callsOf(source)).toEqual([
      "lock-source",
      "insert-event",
      "event-received-validated",
      "allocate-number",
      "insert-journal",
      "insert-lines",
      "post-journal",
      "event-validated-posted",
    ]);
    expect(source.insertEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        payload: expect.objectContaining({
          audit_lines: [
            expect.objectContaining({ account_id: "expense-a", description: "Supplier settlement" }),
            expect.objectContaining({ account_id: "bank-a", description: "Bank control" }),
          ],
        }),
      }),
    );
  });

  it("rejects currency-scale violations before creating an event", async () => {
    const source = repository();
    const input = command({
      lines: [
        { ...command().lines[0]!, debit: "10.001" },
        { ...command().lines[1]!, credit: "10.001" },
      ],
    });
    await expect(new FinancePostingService(source).post(client, input)).rejects.toMatchObject<
      Partial<FinancePostingError>
    >({ code: "FINANCE_CURRENCY_SCALE_INVALID" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing required account dimension before creating an event", async () => {
    const source = repository();
    const input = command({
      lines: [{ ...command().lines[0]!, dimensions: {} }, command().lines[1]!],
    });
    await expect(new FinancePostingService(source).post(client, input)).rejects.toMatchObject<
      Partial<FinancePostingError>
    >({ code: "FINANCE_DIMENSION_REQUIRED" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects transaction imbalance before creating an event", async () => {
    const source = repository();
    const input = command({
      lines: [command().lines[0]!, { ...command().lines[1]!, credit: "9.99" }],
    });
    await expect(new FinancePostingService(source).post(client, input)).rejects.toMatchObject<
      Partial<FinancePostingError>
    >({ code: "FINANCE_JOURNAL_UNBALANCED" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects balanced journal totals outside numeric(38,8)", async () => {
    const halfBoundary = "500000000000000000000000000000.00000000";
    const source = repository({
      loadBaseCurrencies: vi.fn(async () => [{ code: "USD", decimal_places: 8 }]),
      loadTransactionCurrency: vi.fn(async () => ({ code: "USD", decimal_places: 8 })),
    });
    await expect(
      new FinancePostingService(source).post(
        client,
        command({
          lines: [
            { ...command().lines[0]!, debit: halfBoundary },
            { ...command().lines[0]!, debit: halfBoundary },
            { ...command().lines[1]!, credit: halfBoundary },
            { ...command().lines[1]!, credit: halfBoundary },
          ],
        }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_NUMERIC_OUT_OF_RANGE" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects inactive and header accounts before creating an event", async () => {
    for (const account of [
      { status: "inactive" as const, is_header: false, manual_posting_allowed: true },
      { status: "active" as const, is_header: true, manual_posting_allowed: true },
    ]) {
      const source = repository({
        loadAccounts: vi.fn(async () => [
          { id: "expense-a", required_dimensions: ["department"], ...account },
          {
            id: "bank-a",
            status: "active",
            is_header: false,
            manual_posting_allowed: true,
            required_dimensions: [],
          },
        ]),
      });
      await expect(new FinancePostingService(source).post(client, command())).rejects.toMatchObject<
        Partial<FinancePostingError>
      >({ code: account.status === "inactive" ? "FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED" : "FINANCE_ACCOUNT_NOT_POSTABLE" });
      expect(source.insertEvent).not.toHaveBeenCalled();
    }
  });

  it("fails closed when stored FX evidence differs from current rate authority", async () => {
    const source = repository({
      loadTransactionCurrency: vi.fn(async () => ({ code: "EUR", decimal_places: 2 })),
      loadDirectRate: vi.fn(async () => ({ id: "rate-current", rate: "1.250000000000000000" })),
    });
    await expect(
      new FinancePostingService(source).post(
        client,
        command({
          transactionCurrency: "EUR",
          exchangeRateId: "rate-stored",
          exchangeRateValue: "1.20",
        }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_EXCHANGE_RATE_CHANGED" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("blocks a second external key for an already-posted business source", async () => {
    const existing: FinanceEventRow = {
      id: "event-existing",
      source_type: "banking.payment",
      source_id: "payment-a",
      event_type: "bank_payment.posted",
      payload: {},
      payload_hash: "0".repeat(64),
      idempotency_key: `fin:${"1".repeat(64)}`,
      state: "posted",
      compensates_event_id: null,
    };
    const source = repository({ findSourceEvent: vi.fn(async () => existing) });
    await expect(new FinancePostingService(source).post(client, command())).rejects.toMatchObject<
      Partial<FinancePostingError>
    >({ code: "FINANCE_SOURCE_ALREADY_POSTED" });
    expect(source.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects reversal when original event or persisted line evidence is inconsistent", async () => {
    const wrongEventType = originalPosting();
    wrongEventType.event.event_type = "bank_payment.other";
    const wrongOperation = originalPosting();
    wrongOperation.event.payload = { ...(wrongOperation.event.payload as object), operation: "reverse" };
    const wrongCurrency = originalPosting();
    wrongCurrency.lines[0]!.currency = "EUR";

    for (const original of [wrongEventType, wrongOperation, wrongCurrency]) {
      const source = repository({ loadOriginalPosting: vi.fn(async () => original) });
      await expect(
        new FinancePostingService(source).reverse(client, reversalCommand()),
      ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_ORIGINAL_POSTING_INVALID" });
      expect(source.insertEvent).not.toHaveBeenCalled();
    }
  });
});
