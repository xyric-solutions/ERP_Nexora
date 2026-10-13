import { context, propagation, SpanKind, SpanStatusCode, trace, type Span, type SpanOptions } from "@opentelemetry/api";

const tracer = trace.getTracer("@nexora/observability");

export function startSpan(
  name: string,
  options: { kind?: SpanKind; attributes?: Record<string, string | number | boolean> } = {},
): Span {
  return tracer.startSpan(name, options);
}

export function injectTrace(headers: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

export type TraceSpanKind = "internal" | "server" | "client" | "producer" | "consumer";

const spanKinds: Record<TraceSpanKind, SpanKind> = {
  internal: SpanKind.INTERNAL,
  server: SpanKind.SERVER,
  client: SpanKind.CLIENT,
  producer: SpanKind.PRODUCER,
  consumer: SpanKind.CONSUMER,
};

export async function withSpan<T>(
  name: string,
  options: { kind?: TraceSpanKind; attributes?: Record<string, string | number | boolean> },
  work: (span: Span) => Promise<T>,
): Promise<T> {
  const spanOptions: SpanOptions = {
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.kind ? { kind: spanKinds[options.kind] } : {}),
  };
  const result = tracer.startActiveSpan(name, spanOptions, async (span) => {
    try {
      const result = await work(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
  return result as Promise<T>;
}

export function withExtractedSpan<T>(
  name: string,
  carrier: Record<string, string>,
  options: { kind?: TraceSpanKind; attributes?: Record<string, string | number | boolean> },
  work: (span: Span) => Promise<T>,
): Promise<T> {
  const parent = propagation.extract(context.active(), carrier);
  return context.with(parent, () => withSpan(name, options, work));
}
