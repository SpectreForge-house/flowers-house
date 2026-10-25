import { Customer, ImportantDate } from '../types';

/**
 * Yearly-recurring client dates (birthdays, name days, anniversaries).
 *
 * Edge cases handled here:
 * - Feb 29 birthdays in non-leap years fall back to Feb 28 (the day before,
 *   so the greeting can never be "late").
 * - Dates around New Year work naturally: the next occurrence is always the
 *   first one on/after today, which may be in the next year (Dec 30 -> Jan 2).
 */

export interface UpcomingDate {
  customer: Customer;
  date: ImportantDate;
  /** The concrete occurrence (this year or the next one). */
  nextOccurrence: Date;
  /** Whole days from today; 0 = today, 1 = tomorrow. */
  daysLeft: number;
}

/** "YYYY-MM-DD" of a Date in local time. */
export function toLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse the stored "YYYY-MM-DD" into { month: 1-12, day: 1-31 }; null when malformed. */
function parseMonthDay(date: string): { month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) return null;
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Build the occurrence of month/day inside a year; Feb 29 -> Feb 28 in common years. */
function occurrenceInYear(year: number, month: number, day: number): Date {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return new Date(year, 1, 28);
  }
  return new Date(year, month - 1, day);
}

/** Days between two dates ignoring time of day. */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / msPerDay);
}

/** Start of today (local time). */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Next occurrence of a stored date on or after today. Returns null when the
 * stored date is malformed.
 */
export function getNextOccurrence(storedDate: string, from: Date = startOfToday()): Date | null {
  const md = parseMonthDay(storedDate);
  if (!md) return null;
  const thisYear = occurrenceInYear(from.getFullYear(), md.month, md.day);
  if (thisYear.getTime() >= from.getTime()) return thisYear;
  return occurrenceInYear(from.getFullYear() + 1, md.month, md.day);
}

/**
 * All upcoming client dates within the next `windowDays` days (inclusive),
 * sorted by days left. Customers without dates are skipped silently.
 */
export function getUpcomingClientDates(customers: Customer[], windowDays: number): UpcomingDate[] {
  const today = startOfToday();
  const limit = Math.max(0, windowDays);
  const result: UpcomingDate[] = [];

  for (const customer of customers) {
    if (!customer.importantDates || customer.importantDates.length === 0) continue;
    for (const date of customer.importantDates) {
      const next = getNextOccurrence(date.date, today);
      if (!next) continue;
      const daysLeft = daysBetween(today, next);
      if (daysLeft <= limit) {
        result.push({ customer, date, nextOccurrence: next, daysLeft });
      }
    }
  }

  return result.sort((a, b) => a.daysLeft - b.daysLeft || a.customer.name.localeCompare(b.customer.name));
}

/**
 * Occurrences of client dates inside the given calendar month (year + month,
 * 0-based like Date#getMonth). Used by the Calendar page; a month view shows
 * each date once on the day it would be celebrated that year.
 */
export function getClientDatesForMonth(
  customers: Customer[],
  year: number,
  month: number
): Array<{ date: string; customer: Customer; importantDate: ImportantDate }> {
  const result: Array<{ date: string; customer: Customer; importantDate: ImportantDate }> = [];

  for (const customer of customers) {
    if (!customer.importantDates || customer.importantDates.length === 0) continue;
    for (const importantDate of customer.importantDates) {
      const md = parseMonthDay(importantDate.date);
      if (!md) continue;
      const occurrence = occurrenceInYear(year, md.month, md.day);
      // Feb 29 stored -> Feb 28 falls inside February either way.
      if (occurrence.getMonth() === month) {
        result.push({ date: toLocalISO(occurrence), customer, importantDate });
      }
    }
  }

  return result;
}

/** How many days left; used for the "today" / "tomorrow" / "in N days" wording. */
export function daysLeftText(daysLeft: number, today: string, tomorrow: string, inDays: (n: number) => string): string {
  if (daysLeft <= 0) return today;
  if (daysLeft === 1) return tomorrow;
  return inDays(daysLeft);
}
