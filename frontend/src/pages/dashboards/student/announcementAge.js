// Whether an announcement still counts as "NEW": posted fewer than 7 Manila
// calendar days ago (posted today is 0 days old; 6 days old shows, 7 does not).
import { manilaDateToday } from '../../../lib/taskFormatting';

const DAY_MS = 24 * 60 * 60 * 1000;
const NAIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

// news.created_at is a TIMESTAMP WITHOUT TIME ZONE holding UTC: the admin
// screen inserts new Date().toISOString(), and the column default runs on the
// database clock (UTC). So a value with no offset is read as UTC here, unlike
// due_at, which is Manila wall-clock time.
export const newsInstant = value => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const date = new Date(NAIVE_TIMESTAMP.test(text) ? `${text.replace(' ', 'T')}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isNewAnnouncement = (createdAt, now = new Date(), days = 7) => {
  const posted = newsInstant(createdAt);
  if (!posted) return false;
  const age = (Date.parse(manilaDateToday(now)) - Date.parse(manilaDateToday(posted))) / DAY_MS;
  return age < days;
};
