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

// Same prompts, same order, in each language the app speaks.
const PROMPTS = {
  en: { general: GENERAL_PROMPTS, weather: WEATHER_PROMPTS },
  es: {
    general: [
      '¿Qué te hizo sonreír hoy?',
      '¿Qué es lo que quieres recordar de hoy?',
      '¿Qué te quitó energía hoy y qué te la devolvió?',
      '¿En quién pensaste hoy y por qué?',
      '¿Qué te sorprendió hoy?',
      '¿Por qué pequeña cosa sientes gratitud ahora mismo?',
      '¿Qué aprendiste hoy, sobre lo que sea?',
      '¿Qué te gustaría soltar antes de mañana?',
      '¿Qué fue lo mejor que comiste o bebiste hoy?',
      'Describe un momento de hoy que te habría gustado que durara más.',
      '¿Qué tienes en mente que no has dicho en voz alta?',
      '¿Qué esperas con ganas esta semana?',
      '¿Qué hiciste hoy solo para ti?',
      'Si hoy tuviera un título, ¿cuál sería?',
      '¿Qué manejaste mejor de lo que esperabas?',
      '¿Qué conversación se te quedó grabada hoy?',
      '¿Qué haría de mañana un buen día?',
      '¿Dónde te sentiste más a gusto hoy?',
      '¿Qué preocupación puedes dejar a un lado por ahora?',
      '¿Qué notaste hoy que normalmente pasas por alto?',
    ],
    weather: {
      'Clear sky': [
        'Cielo despejado hoy. ¿Saliste? ¿Qué iluminó el sol para ti?',
        'Un día claro y luminoso. ¿Qué se sintió ligero y fácil hoy?',
      ],
      Clouds: [
        'Un día gris y nublado. ¿Qué te levantó el ánimo o qué pesó sobre él?',
        'Bajo las nubes hoy: ¿en qué pensabas en silencio?',
      ],
      Fog: [
        'Hay niebla afuera. ¿Hay algo que no ves claro ahora mismo?',
        'Un día suave y con niebla. ¿Qué te gustaría ver con más claridad?',
      ],
      Drizzle: [
        'Un día de llovizna. ¿Qué pequeño consuelo te ayudó a pasarlo?',
        'Lluvia ligera hoy. ¿Qué hiciste al quedarte en casa?',
      ],
      Rain: [
        'Los días de lluvia lo ralentizan todo. ¿A qué le dedicaste tiempo hoy?',
        'Está lloviendo. ¿Qué es lo más acogedor de este momento?',
      ],
      Snow: [
        '¡Nieve hoy! ¿Cómo se veía el mundo?',
        'Un día de nieve. ¿Con qué te calientas, por dentro o por fuera?',
      ],
      Thunderstorm: [
        'Tormenta hoy. ¿Hay algo que te esté agitando por dentro?',
        'Llegó una tormenta eléctrica. ¿Qué se sintió ruidoso hoy y qué se sintió en calma?',
      ],
    },
  },
  hi: {
    general: [
      'आज किस बात ने आपको मुस्कुराया?',
      'आज की कौन-सी एक बात आप याद रखना चाहते हैं?',
      'आज किस चीज़ ने आपकी ऊर्जा छीनी, और किसने लौटाई?',
      'आज आपने किसके बारे में सोचा, और क्यों?',
      'आज किस बात ने आपको हैरान किया?',
      'अभी किस छोटी-सी चीज़ के लिए आप शुक्रगुज़ार हैं?',
      'आज आपने क्या सीखा, किसी भी बारे में?',
      'कल से पहले आप क्या छोड़ देना चाहेंगे?',
      'आज आपने सबसे अच्छा क्या खाया या पिया?',
      'आज का कोई ऐसा पल लिखिए जो आप चाहते थे कि और देर तक चलता।',
      'आपके मन में ऐसा क्या है जो आपने अब तक कहा नहीं?',
      'इस हफ़्ते आप किस बात का इंतज़ार कर रहे हैं?',
      'आज आपने सिर्फ़ अपने लिए क्या किया?',
      'अगर आज के दिन का कोई शीर्षक होता, तो क्या होता?',
      'किस चीज़ को आपने उम्मीद से बेहतर संभाला?',
      'आज की कौन-सी बातचीत आपके मन में रह गई?',
      'कल को अच्छा दिन क्या बनाएगा?',
      'आज आपको सबसे ज़्यादा सुकून कहाँ मिला?',
      'कौन-सी चिंता आप अभी के लिए एक तरफ़ रख सकते हैं?',
      'आज आपने ऐसा क्या देखा जिस पर आमतौर पर ध्यान नहीं जाता?',
    ],
    weather: {
      'Clear sky': [
        'आज आसमान साफ़ है। क्या आप बाहर निकले? धूप ने आपके लिए क्या रोशन किया?',
        'एक उजला, साफ़ दिन। आज क्या हल्का और आसान लगा?',
      ],
      Clouds: [
        'एक धुँधला, बादलों भरा दिन। किस चीज़ ने आपका मन बनाए रखा, या किसने उसे भारी किया?',
        'आज बादलों के नीचे: आप चुपचाप क्या सोच रहे थे?',
      ],
      Fog: [
        'बाहर कोहरा है। क्या अभी कुछ साफ़ नहीं दिख रहा?',
        'एक नरम, कोहरे भरा दिन। आप किस चीज़ को और साफ़ देखना चाहेंगे?',
      ],
      Drizzle: [
        'बूँदाबाँदी वाला दिन। किस छोटी-सी राहत ने दिन निकाला?',
        'आज हल्की बारिश हुई। घर पर रहकर आपने क्या किया?',
      ],
      Rain: [
        'बारिश के दिन सब कुछ धीमा कर देते हैं। आज आपने किस चीज़ पर आराम से वक़्त लगाया?',
        'बारिश हो रही है। इस पल की सबसे सुकून भरी बात क्या है?',
      ],
      Snow: [
        'आज बर्फ़ गिरी! दुनिया कैसी दिख रही थी?',
        'बर्फ़ीला दिन। आप किस चीज़ से गर्माहट पा रहे हैं, भीतर या बाहर?',
      ],
      Thunderstorm: [
        'आज तूफ़ानी मौसम है। क्या भीतर कुछ हलचल मचा रहा है?',
        'आँधी-तूफ़ान आया। आज क्या शोर भरा लगा, और क्या शांत?',
      ],
    },
  },
};

function dayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// The prompt to show for a given day. It's stable all day (keyed by date,
// not random), and `shuffle` steps to the next one when you ask for another.
// When the entry's weather is known, the day's first prompt is about that
// weather; shuffling then moves on to the general prompts.
export function getPrompt(date, weatherType, shuffle = 0, language = 'en') {
  const day = dayNumber(date);
  const { general: generalPool, weather } = PROMPTS[language] || PROMPTS.en;
  const weatherPool = weather[weatherType];
  const general = (offset) => generalPool[(day + offset) % generalPool.length];

  if (!weatherPool) return general(shuffle);
  if (shuffle % (generalPool.length + 1) === 0) return weatherPool[day % weatherPool.length];
  return general((shuffle % (generalPool.length + 1)) - 1);
}
