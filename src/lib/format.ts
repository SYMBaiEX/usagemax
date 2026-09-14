export function compactNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
}

export function currencyFromMicros(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value / 1_000_000);
}

export function percent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function shortDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value,
  );
}

export function relativeTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
