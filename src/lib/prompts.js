export const GENERAL_PROMPTS = [
  'What made you smile today?',
  'What is one thing you want to remember about today?',
  'What drained your energy today, and what gave it back?',
  'Who did you think about today, and why?',
  'What surprised you today?',
  'What is something small you are grateful for right now?',
  'What did you learn today, about anything at all?',
  'What would you like to let go of before tomorrow?',
  'What was the best thing you ate or drank today?',
  'Describe a moment today you wish had lasted longer.',
  'What is on your mind that you have not said out loud?',
  'What are you looking forward to this week?',
  'What did you do today just for yourself?',
  'If today had a title, what would it be?',
  'What is something you handled better than you expected?',
  'What conversation stuck with you today?',
  'What would make tomorrow a good day?',
  'Where did you feel most at ease today?',
  'What is a worry you can set down for now?',
  'What did you notice today that you usually overlook?',
];

// Keyed by the weatherType values from lib/weatherApi.js.
export const WEATHER_PROMPTS = {
  'Clear sky': [
    'Clear skies today. Did you get outside? What did the sun light up for you?',
    'A bright, clear day. What felt light and easy today?',
  ],
  Clouds: [
    'A grey, cloudy day. What kept your mood up, or what weighed on it?',
    'Under the clouds today: what were you quietly thinking about?',
  ],
  Fog: [
    'Foggy out there. Is anything feeling unclear right now?',
    'A soft, foggy day. What would you like to see more clearly?',
  ],
  Drizzle: [
    'A drizzly day. What small comfort got you through it?',
    'Light rain today. What did you do when you stayed in?',
  ],
  Rain: [
    'Rainy days slow things down. What did you take your time with today?',
    'It is raining. What is the cosiest thing about right now?',
  ],
  Snow: [
    'Snow today! What did the world look like?',
    'A snowy day. What are you warming up with, inside or out?',
  ],
  Thunderstorm: [
    'Stormy weather today. Is anything stirring you up inside?',
    'A thunderstorm rolled in. What felt loud today, and what felt calm?',
  ],
};

function dayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// The prompt to show for a given day. It's stable all day (keyed by date,
// not random), and `shuffle` steps to the next one when you ask for another.
// When the entry's weather is known, the day's first prompt is about that
// weather; shuffling then moves on to the general prompts.
export function getPrompt(date, weatherType, shuffle = 0) {
  const day = dayNumber(date);
  const weatherPool = WEATHER_PROMPTS[weatherType];
  const general = (offset) => GENERAL_PROMPTS[(day + offset) % GENERAL_PROMPTS.length];

  if (!weatherPool) return general(shuffle);
  if (shuffle % (GENERAL_PROMPTS.length + 1) === 0) return weatherPool[day % weatherPool.length];
  return general((shuffle % (GENERAL_PROMPTS.length + 1)) - 1);
}
