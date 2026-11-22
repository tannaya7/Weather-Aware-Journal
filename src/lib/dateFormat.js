const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// English keeps the hand-made formats below; other languages use the
// browser's own month and day names for that language.
function localized(language, d, options) {
  return new Intl.DateTimeFormat(language, options).format(d);
}

const UNDATED = { en: 'Undated', es: 'Sin fecha', hi: 'बिना तारीख' };

// Formats the date string into something nice for the card
// Example: "28 Nov 2025"
export function formatDateForCard(isoString, language = 'en') {
  if (!isoString) return '';

  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  if (language !== 'en') return localized(language, d, { day: '2-digit', month: 'short', year: 'numeric' });

  const day = d.getDate().toString().padStart(2, '0');
  return `${day} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Long form for the entry reading page. Example: "Friday, 28 November 2025"
export function formatDateLong(isoString, language = 'en') {
  if (!isoString) return '';

  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  if (language !== 'en') {
    return localized(language, d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  return `${WEEKDAY_NAMES_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// Small "calendar corner" badge used in the timeline: { day: '28', weekday: 'Fri' }
export function getDateBadgeParts(isoString, language = 'en') {
  if (!isoString) return { day: '—', weekday: '' };

  const d = new Date(isoString);
  if (isNaN(d)) return { day: '—', weekday: '' };

  return {
    day: d.getDate().toString(),
    weekday: language === 'en' ? WEEKDAY_NAMES_SHORT[d.getDay()] : localized(language, d, { weekday: 'short' }),
  };
}

// Grouping key + label for the monthly timeline sections. Example key: "2025-11"
export function getMonthKey(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(isoString, language = 'en') {
  const d = new Date(isoString);
  if (isNaN(d)) return UNDATED[language] || UNDATED.en;
  if (language !== 'en') return localized(language, d, { month: 'long', year: 'numeric' });
  return `${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// 0-indexed (0 = January), for calendar-grid style month headers.
export function monthNameLong(monthIndex, language = 'en') {
  if (language !== 'en') return localized(language, new Date(2000, monthIndex, 1), { month: 'long' });
  return MONTH_NAMES_LONG[monthIndex];
}

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Monday first (0 = Monday). 3 Jan 2000 was a Monday.
const WEEKDAYS_FROM_MONDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function weekdayNameLong(mondayIndex, language = 'en') {
  if (language === 'en') return WEEKDAYS_FROM_MONDAY[mondayIndex];
  return localized(language, new Date(2000, 0, 3 + mondayIndex), { weekday: 'long' });
}

// Sunday first, like WEEKDAY_INITIALS. 2 Jan 2000 was a Sunday.
export function weekdayInitials(language = 'en') {
  if (language === 'en') return WEEKDAY_INITIALS;
  return Array.from({ length: 7 }, (_, i) => localized(language, new Date(2000, 0, 2 + i), { weekday: 'narrow' }));
}

export function isSameDay(dateString, refDate) {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d)) return false;
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}
