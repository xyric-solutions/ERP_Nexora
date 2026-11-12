"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { groupAmount, normalizeAmount, parseAmount, toRawAmount, type AmountFormatOptions } from "@/shared/model/amount-format";

type NativeInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "inputMode">;

export interface AmountInputProps extends NativeInputProps, AmountFormatOptions {
  /** Controlled value: a number or a raw/grouped numeric string. */
  value?: string | number | null;
  /** Initial value for uncontrolled use. */
  defaultValue?: string | number | null;
  /**
   * Called on every edit with the unformatted value ("1234.5", "" when cleared)
   * and its numeric reading (0 when blank).
   */
  onValueChange?: (raw: string, amount: number) => void;
}

const SIGNIFICANT = /[0-9.-]/;

/**
 * Money entry field that groups thousands while typing (1,000 · 10,000 · 1,000,000).
 * It renders a text input, so form posts and handlers receive the raw value via
 * `onValueChange`; when `name` is set, a hidden input carries the raw value.
 */
function AmountInput({
  value,
  defaultValue,
  onValueChange,
  decimals = 2,
  allowNegative,
  min,
  name,
  className,
  onBlur,
  ref,
  ...props
}: AmountInputProps) {
  const options = React.useMemo<AmountFormatOptions>(
    () => ({ decimals, allowNegative: allowNegative ?? (min !== undefined && Number(min) < 0) }),
    [decimals, allowNegative, min],
  );
  const controlled = value !== undefined;
  const external = toRawAmount(controlled ? value : defaultValue, options);
  const [text, setText] = React.useState(() => groupAmount(external));
  const [seen, setSeen] = React.useState(external);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const caret = React.useRef<number | null>(null);
  const [edit, setEdit] = React.useState(0);

  // Re-sync when application state changes the value (reset, calculated fill, record switch),
  // but keep the user's in-progress text ("1,000." or "") when it already means the same number.
  if (controlled && external !== seen) {
    setSeen(external);
    if (parseAmount(text) !== parseAmount(external)) setText(groupAmount(external));
  }

  React.useLayoutEffect(() => {
    const element = inputRef.current;
    if (caret.current === null || !element || element !== document.activeElement) return;
    element.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text, edit]);

  const setRefs = React.useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = element;
    },
    [ref],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const position = event.target.selectionStart ?? typed.length;
    const significantBefore = typed.slice(0, position).replace(/[^0-9.-]/g, "").length;
    const raw = normalizeAmount(typed, options);
    const formatted = groupAmount(raw);
    let index = 0;
    for (let count = 0; index < formatted.length && count < significantBefore; index += 1) {
      if (SIGNIFICANT.test(formatted[index])) count += 1;
    }
    caret.current = index;
    setText(formatted);
    setEdit((n) => n + 1);
    onValueChange?.(raw === "-" ? "" : raw, parseAmount(raw));
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (text.endsWith(".") || text === "-") {
      const tidy = text === "-" ? "" : text.slice(0, -1);
      setText(tidy);
      const raw = tidy.replace(/,/g, "");
      onValueChange?.(raw, parseAmount(raw));
    }
    onBlur?.(event);
  };

  return (
    <>
      <Input
        {...props}
        ref={setRefs}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        className={cn("text-right tabular-nums", className)}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {name ? <input type="hidden" name={name} value={text.replace(/,/g, "").replace(/\.$/, "")} disabled={props.disabled} /> : null}
    </>
  );
}

export { AmountInput };
