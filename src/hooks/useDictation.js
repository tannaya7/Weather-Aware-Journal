import { useCallback, useEffect, useRef, useState } from 'react';

function getRecognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it for this site to dictate.',
  'service-not-allowed': 'Microphone access is blocked. Allow it for this site to dictate.',
  'no-speech': "Didn't catch anything. Try again a little closer to the microphone.",
  'audio-capture': 'No microphone was found.',
  network: 'Dictation needs an internet connection in this browser.',
};

// Speech-to-text with the browser's Web Speech API. Finished phrases are
// handed to onText as they're recognised; the phrase still being spoken is
// in `interim` so it can be previewed. Not every browser has it (Firefox
// doesn't), so check `supported` before offering it.
export function useDictation(onText) {
  const Recognition = getRecognitionClass();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!Recognition || recognitionRef.current) return;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) onTextRef.current(text.trim());
        else pending += text;
      }
      setInterim(pending);
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      setError(ERROR_MESSAGES[event.error] || "Dictation stopped because of an error. Try again.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;
    setError('');
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("Couldn't start dictation. Try again.");
    }
  }, [Recognition]);

  // Stop listening if the form closes mid-sentence.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported: Boolean(Recognition), listening, interim, error, start, stop };
}
