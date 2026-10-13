const PHILIPPINE_TIME_ZONE = 'Asia/Manila';

export function matchesCalendarFilter(event, typeFilter = '') {
  if (!typeFilter) return true;
  if (typeFilter === 'Custom Type') {
    return event?.event_type === 'Other' && Boolean(event?.custom_event_type?.trim());
  }
  return event?.event_type === typeFilter;
}

export function isInvalidCalendarRange(startDate, endDate) {
  return Boolean(startDate && endDate && endDate < startDate);
}

export function philippineDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function upcomingCalendarEvents(events, typeFilter = '', todayKey = philippineDateKey()) {
  return events
    .filter((event) => matchesCalendarFilter(event, typeFilter))
    .filter((event) => {
      if (!event?.event_date) return false;
      const effectiveEnd = event.end_date && event.end_date > event.event_date
        ? event.end_date
        : event.event_date;
      return effectiveEnd >= todayKey;
    })
    .slice(0, 4);
}
