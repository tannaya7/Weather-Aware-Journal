import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_MEMO_SECONDS = 5 * 60;

// First format the browser can record: Chrome/Firefox use WebM/Opus,
// Safari uses MP4/AAC.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't save the recording."));
    reader.readAsDataURL(blob);
  });
}

const ERRORS = {
  NotAllowedError: 'Microphone access is blocked. Allow it for this site to record.',
  NotFoundError: 'No microphone was found.',
};

// Records a voice memo from the microphone. Stops by itself after
// MAX_MEMO_SECONDS, and hands the finished memo (a data URL, so it's saved
// and encrypted with the entry like photos) to onDone.
export function useVoiceRecorder(onDone) {
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && pickType() !== null;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    setError('');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(ERRORS[err.name] || "Couldn't start the microphone.");
      return;
    }

    const mimeType = pickType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);
      setSeconds(0);
      const duration = Math.round((Date.now() - startedAt) / 1000);
      if (!chunks.length || duration < 1) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      try {
        onDoneRef.current({
          src: await blobToDataUrl(blob),
          duration,
          mimeType: blob.type,
          recordedAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(err.message);
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_MEMO_SECONDS) recorder.stop();
    }, 500);
  }, [supported]);

  // Leaving the form mid-recording stops the microphone.
  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
        recorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  return { supported, recording, seconds, error, start, stop };
}

export function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
