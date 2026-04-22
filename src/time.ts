const TORONTO_TIME_ZONE = 'America/Toronto';

export function torontoDateString(date = new Date()): string {
  return formatDateForTimeZone(date, TORONTO_TIME_ZONE);
}

export function weekdayForDateInToronto(date: string): string {
  return weekdayForDateInTimeZone(date, TORONTO_TIME_ZONE);
}

export function dateStringForTimeZone(timeZone: string, date = new Date()): string {
  return formatDateForTimeZone(date, timeZone || TORONTO_TIME_ZONE);
}

export function weekdayForDateInTimeZone(date: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || TORONTO_TIME_ZONE,
    weekday: 'long',
  }).format(new Date(`${date}T12:00:00Z`));

  return weekday.toLowerCase();
}

export function shiftDateString(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function formatDateForTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to format date for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

export function torontoTimeZone(): string {
  return TORONTO_TIME_ZONE;
}
