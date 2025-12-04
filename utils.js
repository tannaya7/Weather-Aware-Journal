// Formats the date string into something nice for the card
// Example: "28 Nov 2025"
export function formatDateForCard(isoString) {
    if (!isoString) return '';

    const d = new Date(isoString);
    // Return original string if date is invalid
    if (isNaN(d)) return isoString;

    const day = d.getDate().toString().padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
}
