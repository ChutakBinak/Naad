import { useRef, useCallback, useState } from 'react';
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
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // ── Close routing AudioContext ────────────────────────────────────────────
  const closeAudioCtx = useCallback(() => {
    setAnalyserNode(null);
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
    (stream: MediaStream, onStop?: () => void) => {
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
        onStop?.(); // e.g. stop rawStream video tracks from getDisplayMedia
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

    // Create and resume the AudioContext immediately — while we still have the
    // user-gesture token from the button click. If we create it after the
    // getDisplayMedia await Chrome may block audio output (autoplay policy).
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    audioCtxRef.current = ctx;
    await ctx.resume();

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

      // ⚠️  Do NOT call rawStream.getVideoTracks().forEach(t => t.stop()) here.
      //    In Chrome, stopping the video track of a getDisplayMedia stream
      //    terminates the entire capture session — audio tracks are ended too,
      //    so no audio ever flows through the AudioContext. We keep the tiny
      //    1×1 video track alive and stop ALL rawStream tracks on cleanup.
      const audioTracks = rawStream.getAudioTracks();
      if (audioTracks.length === 0) {
        rawStream.getTracks().forEach((t) => t.stop()); // clean up before throw
        throw new Error(
          'No audio track received. Make sure you checked "Share tab audio" in the picker.'
        );
      }

      // ── Route: captured stream → speakers AND recorder ────────────────────
      const src      = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      const dest     = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      src.connect(ctx.destination); // playback — user hears the capture
      src.connect(dest);             // feed into MediaRecorder
      src.connect(analyser);         // tap for level meter

      setAnalyserNode(analyser);

      // If the user clicks "Stop sharing" in the browser chrome, stop recording
      audioTracks[0].addEventListener('ended', () => stopRef.current(), { once: true });

      // Stop ALL rawStream tracks (incl. the video track) when recording ends
      startFromStream(dest.stream, () => rawStream.getTracks().forEach((t) => t.stop()));
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

  // ── Prime AudioContext on button click (before file picker opens) ─────────
  // Call this synchronously in the onClick handler of the "Load Audio File"
  // button. By the time onChange fires from the file picker, the AudioContext
  // is already running and startFromFile can skip the ctx.resume() await,
  // sidestepping any question of whether the file-input change event carries
  // a fresh user-gesture token in the current Chrome version.
  const primeCtx = useCallback(() => {
    const existing = audioCtxRef.current;
    if (!existing || existing.state === 'closed') {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = ctx;
      ctx.resume().catch(() => {});
    } else if (existing.state === 'suspended') {
      existing.resume().catch(() => {});
    }
  }, []);

  // ── Load audio from a file ────────────────────────────────────────────────
  const startFromFile = useCallback(
    async (file: File) => {
      setError(null);
      setState('requesting');

      try {
        // Re-use a context that primeCtx() already resumed (called in the
        // button onClick). If not pre-primed, create and resume now — the
        // file-input onChange IS a user-activated event and should still
        // carry a gesture token in most Chrome versions.
        const existing = audioCtxRef.current;
        const ctx = (existing && existing.state !== 'closed')
          ? existing
          : new AudioContext({ latencyHint: 'interactive' });
        audioCtxRef.current = ctx;
        if (ctx.state !== 'running') await ctx.resume();

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const src     = ctx.createBufferSource();
        const dest    = ctx.createMediaStreamDestination();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        src.buffer = audioBuffer;
        src.connect(ctx.destination); // playback — user hears the file
        src.connect(dest);             // feed into MediaRecorder
        src.connect(analyser);         // tap for level meter

        setAnalyserNode(analyser);

        startFromStream(dest.stream);
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
    primeCtx,
    cleanup,
    startTimeRef,
    analyserNode,
  };
}
