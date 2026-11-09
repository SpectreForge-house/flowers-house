const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Returns the 'YYYY-MM-DD' value for a date input, using the same local
 * calendar date that `formatDate` shows to the user. Manual purchases already
 * store a plain date, so it is returned untouched.
 */
export function toDateInputValue(value: string): string {
  if (!value.includes('T')) return value.slice(0, 10);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Replaces the local calendar date of a timestamp while keeping its local time
 * of day, so the purchase stays at the same time and the displayed date matches
 * the date picked in the dialog. Returns an ISO timestamp.
 */
export function replaceLocalDate(value: string, date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const original = new Date(value);

  const hours = Number.isNaN(original.getTime()) ? 12 : original.getHours();
  const minutes = Number.isNaN(original.getTime()) ? 0 : original.getMinutes();
  const seconds = Number.isNaN(original.getTime()) ? 0 : original.getSeconds();
  const milliseconds = Number.isNaN(original.getTime()) ? 0 : original.getMilliseconds();

  return new Date(year, month - 1, day, hours, minutes, seconds, milliseconds).toISOString();
}
