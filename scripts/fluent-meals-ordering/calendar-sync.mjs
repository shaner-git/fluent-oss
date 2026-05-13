const DEFAULT_TIME_ZONE = 'America/Toronto';

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function buildDeliveryCalendarCandidate(options) {
  const confirmedOrder = options?.confirmedOrder ?? {};
  const retailer = String(options?.retailer || confirmedOrder.retailer || 'voila').trim().toLowerCase();
  const orderId = String(confirmedOrder.orderId || '').trim();
  const slotWindow = String(confirmedOrder.slotWindow || '').trim();
  if (!orderId) {
    throw new Error('Delivery-event candidate requires a confirmed retailer order id.');
  }
  if (!slotWindow) {
    throw new Error(`Delivery-event candidate requires a delivery slot window for ${retailer} order ${orderId}.`);
  }

  const timeZone = String(options?.timeZone || DEFAULT_TIME_ZONE).trim();
  const slot = parseVoilaSlotWindow(slotWindow, confirmedOrder.confirmedAt || new Date().toISOString(), timeZone);
  const summary = buildDeliverySummary(retailer);
  const description = buildDeliveryDescription({
    confirmedAt: confirmedOrder.confirmedAt || null,
    orderId,
    retailer,
    slotWindow,
  });

  return {
    description,
    endsAt: slot.to,
    externalId: buildDeliveryExternalId(retailer, orderId),
    location: 'Home',
    orderId,
    retailer,
    slotWindow,
    startsAt: slot.from,
    summary,
    timeZone: slot.timeZone,
  };
}

export function buildDeliveryExternalId(retailer, orderId) {
  const normalizedRetailer = String(retailer || '').trim().toLowerCase();
  const normalizedOrderId = String(orderId || '').trim();
  return `${normalizedRetailer}-delivery-${normalizedOrderId}`;
}

export function buildDeliverySummary(retailer) {
  return `${capitalize(retailer)} delivery`;
}

export function buildDeliveryDescription(input) {
  return [
    `${capitalize(input.retailer)} grocery delivery`,
    `Retailer order id: ${input.orderId}`,
    `Delivery window: ${input.slotWindow}`,
    input.confirmedAt ? `Confirmed at: ${input.confirmedAt}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseVoilaSlotWindow(slotWindow, confirmedAt, timeZone) {
  const match = String(slotWindow)
    .trim()
    .match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}(?:am|pm))\s*-\s*(\d{1,2}:\d{2}(?:am|pm))$/i);
  if (!match) {
    throw new Error(`Unsupported delivery slot format: ${slotWindow}`);
  }

  const month = MONTHS[match[1].toLowerCase()];
  if (month == null) {
    throw new Error(`Unsupported delivery slot month in ${slotWindow}`);
  }

  const confirmedDate = new Date(confirmedAt);
  const year = Number.isFinite(confirmedDate.getTime()) ? confirmedDate.getFullYear() : new Date().getFullYear();
  const day = Number(match[2]);
  const start = parseClock(match[3]);
  const end = parseClock(match[4]);

  const from = formatTorontoOffsetDate(year, month, day, start.hour, start.minute, timeZone);
  const to = formatTorontoOffsetDate(year, month, day, end.hour, end.minute, timeZone);

  return {
    from,
    timeZone,
    to,
  };
}

function parseClock(value) {
  const match = String(value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) {
    throw new Error(`Unsupported delivery clock value: ${value}`);
  }
  let hour = Number(match[1]) % 12;
  const minute = Number(match[2]);
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm') hour += 12;
  return { hour, minute };
}

function formatTorontoOffsetDate(year, monthIndex, day, hour, minute, timeZone) {
  if (timeZone !== DEFAULT_TIME_ZONE) {
    throw new Error(`Unsupported delivery calendar timezone override: ${timeZone}`);
  }
  const utcDate = new Date(Date.UTC(year, monthIndex, day, hour + 4, minute, 0));
  const offset = getTorontoOffset(utcDate);
  const local = new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00${offset}`;
}

function getTorontoOffset(date) {
  const year = date.getUTCFullYear();
  const dstStartDay = nthWeekdayOfMonthUtc(year, 2, 0, 2);
  const dstEndDay = nthWeekdayOfMonthUtc(year, 10, 0, 1);
  const dstStartUtc = Date.UTC(year, 2, dstStartDay, 7, 0, 0);
  const dstEndUtc = Date.UTC(year, 10, dstEndDay, 6, 0, 0);
  const timestamp = date.getTime();
  return timestamp >= dstStartUtc && timestamp < dstEndUtc ? '-04:00' : '-05:00';
}

function nthWeekdayOfMonthUtc(year, monthIndex, weekday, nth) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = first.getUTCDay();
  const delta = (weekday - firstWeekday + 7) % 7;
  return 1 + delta + (nth - 1) * 7;
}

function capitalize(value) {
  const text = String(value || '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
