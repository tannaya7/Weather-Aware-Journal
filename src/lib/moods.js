export const MOODS = [
  { value: 'Happy', emoji: '😊' },
  { value: 'Peaceful', emoji: '😌' },
  { value: 'Sad', emoji: '😢' },
  { value: 'Excited', emoji: '🤩' },
];

export function emojiForMood(mood) {
  return MOODS.find((m) => m.value === mood)?.emoji || '';
}
