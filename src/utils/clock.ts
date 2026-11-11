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
  return nowIso().slice(0, 10);
}

export function currentDate(): Date {
  return new Date();
}

export function nowMs(): number {
  return Date.now();
}
