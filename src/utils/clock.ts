// Clock helpers.
//
// Reading the clock directly inside a component body makes rendering impure:
// the same props and state can produce different output on every render. These
// helpers keep the impure calls in one place so components stay predictable and
// the values are easy to replace in tests.

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local-date key in the `YYYY-MM-DD` format used by the forms and filters. */
export function todayIso(): string {
  return localDateKey(currentDate());
}

/**
 * `YYYY-MM-DD` of a date in the device's timezone. `toISOString()` would give
 * the UTC day, which is still "yesterday" between midnight and 02:00/03:00 in
 * Bulgaria and would shift orders, deliveries and reminders by one day.
 */
export function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentDate(): Date {
  return new Date();
}

export function nowMs(): number {
  return Date.now();
}
