/** Provider decimal cents -> integer USD micros; no floating point accumulation. */
export function centsToMicros(value: unknown): number {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("INVALID_PROVIDER_AMOUNT");
  const [whole, fraction = ""] = text.split(".");
  const padded = fraction.padEnd(5, "0");
  const result =
    BigInt(whole) * BigInt(10_000) +
    BigInt(padded.slice(0, 4)) +
    BigInt(Number(padded[4]) >= 5 ? 1 : 0);
  if (result > BigInt(1_000_000_000_000_000))
    throw new Error("PROVIDER_AMOUNT_OVERFLOW");
  return Number(result);
}

export function nextDay(day: string, offset = 1) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function addMoney(a: number, b: number) {
  if (!Number.isSafeInteger(a + b)) throw new Error("PROVIDER_AMOUNT_OVERFLOW");
  return a + b;
}
