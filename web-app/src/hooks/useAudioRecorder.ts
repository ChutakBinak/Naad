import { useRef, useCallback } from 'react';
import { useRecordingStore } from '../store/recordingStore';

const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function getSupportedMimeType(): string {
  for (const type of MIME_TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/**
 * Hook that manages the MediaRecorder lifecycle.
 *
 * Audio routing for both capture paths:
 *
 *   captured/file audio
 *         │
 *      GainNode (unity)
 *      ├── audioCtx.destination   → user hears it while cueing
 *      └── MediaStreamDestination → MediaRecorder records it
 */
export function useAudioRecorder() {
  const { setState, setElapsed, addCue, setAudioBlob, setError } =
    useRecordingStore();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const startTimeRef     = useRef<number>(0);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);

  // ── Close routing AudioContext ────────────────────────────────────────────
  const closeAudioCtx = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setElapsed(Date.now() - startTimeRef.current);
      mediaRecorderRef.current.stop();
    }
    setState('stopped');
  }, [setState, setElapsed]);

  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;

  // ── Internal: attach MediaStream to MediaRecorder ─────────────────────────
  const startFromStream = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob, mimeType);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        closeAudioCtx();
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      startTimeRef.current     = Date.now();

      setState('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 50);
    },
    [setState, setElapsed, setAudioBlob, closeAudioCtx]
  );

  // ── Capture tab audio via getDisplayMedia ─────────────────────────────────
  const startDisplayCapture = useCallback(async () => {
    setError(null);
    setState('requesting');

    try {
      const rawStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Chrome-specific constraint — keeps video track 1×1 so it's effectively free
          displaySurface:  'browser',
          width:           { ideal: 1 },
          height:          { ideal: 1 },
          frameRate:       { ideal: 1 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          sampleRate:       44100,
        },
        // @ts-expect-error: Chrome-only constraint
        selfBrowserSurface: 'exclude',
      });

      // Drop video — we only need audio
      rawStream.getVideoTracks().forEach((t) => t.stop());

      const audioTracks = rawStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error(
          'No audio track received. Make sure you checked "Share tab audio" in the picker.'
        );
      }

      // ── Route: captured stream → speakers AND recorder ────────────────────
      const ctx  = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = ctx;

      const src  = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      const dest = ctx.createMediaStreamDestination();

      src.connect(ctx.destination); // playback — user hears the capture
      src.connect(dest);             // feed into MediaRecorder

      // If the user clicks "Stop sharing" in the browser chrome, stop recording
      audioTracks[0].addEventListener('ended', () => stopRef.current(), { once: true });

      startFromStream(dest.stream);

      if (ctx.state === 'suspended') await ctx.resume();
    } catch (err) {
      closeAudioCtx();
      setState('idle');
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Permission denied. Please allow screen capture and try again.');
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  }, [setState, setError, startFromStream, closeAudioCtx]);

  // ── Load audio from a file ────────────────────────────────────────────────
  const startFromFile = useCallback(
    async (file: File) => {
      setError(null);
      setState('requesting');

      try {
        const ctx = new AudioContext({ latencyHint: 'interactive' });
        audioCtxRef.current = ctx;

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const src  = ctx.createBufferSource();
        const dest = ctx.createMediaStreamDestination();

        src.buffer = audioBuffer;
        src.connect(ctx.destination); // playback — user hears the file
        src.connect(dest);             // feed into MediaRecorder

        startFromStream(dest.stream);
        if (ctx.state === 'suspended') await ctx.resume();
        src.start(0);

        // Auto-stop when the file finishes
        src.onended = () => stopRef.current();
      } catch (err) {
        closeAudioCtx();
        setState('idle');
        setError(err instanceof Error ? err.message : 'Failed to load audio file');
      }
    },
    [setState, setError, startFromStream, closeAudioCtx]
  );

  // ── Add cue point ─────────────────────────────────────────────────────────
  const addCuePoint = useCallback(() => {
    addCue(Date.now() - startTimeRef.current);
  }, [addCue]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    closeAudioCtx();
  }, [closeAudioCtx]);

  return {
    startDisplayCapture,
    startFromFile,
    stopRecording,
    addCuePoint,
    cleanup,
    startTimeRef,
  };
}
