import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { CuePoint } from '../types';

interface Props {
  audioBlob: Blob;
  cuePoints: CuePoint[];
}

/**
 * WaveSurfer-backed waveform with overlaid cue-point markers.
 *
 * Cue markers are rendered as absolutely-positioned elements over the
 * waveform canvas. Each marker shows its index and timestamp on hover.
 * Slice regions (spans between adjacent cues) are tinted in alternating
 * colours so the user can see exactly what each sample will contain.
 */
export function WaveformViewer({ audioBlob, cuePoints }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef        = useRef<WaveSurfer | null>(null);
  const urlRef       = useRef<string>('');

  const [isPlaying,  setIsPlaying]  = useState(false);
  const [isReady,    setIsReady]    = useState(false);
  const [wsDuration, setWsDuration] = useState(0); // seconds

  // ── Instantiate WaveSurfer whenever audioBlob changes ────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Revoke any previous object URL
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);

    const url       = URL.createObjectURL(audioBlob);
    urlRef.current  = url;

    const ws = WaveSurfer.create({
      container:     containerRef.current,
      waveColor:     '#334155',
      progressColor: '#4a9eff',
      cursorColor:   '#94a3b8',
      cursorWidth:   1,
      height:        88,
      normalize:     true,
      interact:      true,
      barWidth:      2,
      barGap:        1,
      barRadius:     2,
    });

    wsRef.current = ws;
    ws.load(url);

    ws.on('ready',  () => { setIsReady(true); setWsDuration(ws.getDuration()); });
    ws.on('play',   () => setIsPlaying(true));
    ws.on('pause',  () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
      setWsDuration(0);
    };
  }, [audioBlob]);

  // Revoke URL on unmount
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const handlePlayPause = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  // Derive cue positions as % of total duration
  const totalMs = wsDuration * 1000;

  // Colour palette for slice regions (translucent, loops through 6 colours)
  const REGION_COLOURS = [
    'rgba(74,158,255,0.08)',
    'rgba(245,158,11,0.08)',
    'rgba(139,92,246,0.08)',
    'rgba(16,185,129,0.08)',
    'rgba(239,68,68,0.08)',
    'rgba(236,72,153,0.08)',
  ];

  /**
   * Build slice regions: segments from [0, cue1, cue2, …, end].
   * Returns { startPct, widthPct, colourIndex } for each slice.
   */
  const sliceRegions = isReady && totalMs > 0
    ? (() => {
        const boundaries = [0, ...cuePoints.map((c) => c.timestamp), totalMs];
        return boundaries.slice(0, -1).map((start, i) => ({
          startPct: (start / totalMs) * 100,
          widthPct: ((boundaries[i + 1] - start) / totalMs) * 100,
          colourIndex: i % REGION_COLOURS.length,
        }));
      })()
    : [];

  return (
    <div className="waveform-viewer">
      {/* ── Waveform canvas + overlays ────────────────────────────────────── */}
      <div className="waveform-wrap">
        {/* WaveSurfer mounts here */}
        <div ref={containerRef} className="waveform-canvas" />

        {isReady && totalMs > 0 && (
          <div className="waveform-overlay" aria-hidden="true">
            {/* Slice region tints */}
            {sliceRegions.map((r, i) => (
              <div
                key={i}
                className="waveform-region"
                style={{
                  left:            `${r.startPct}%`,
                  width:           `${r.widthPct}%`,
                  backgroundColor: REGION_COLOURS[r.colourIndex],
                }}
              />
            ))}

            {/* Cue-point marker lines + badges */}
            {cuePoints.map((cue, i) => {
              const pct = (cue.timestamp / totalMs) * 100;
              return (
                <div
                  key={cue.timestamp}
                  className="waveform-cue-marker"
                  style={{ left: `${pct}%` }}
                  title={`Cue ${i + 1} — ${(cue.timestamp / 1000).toFixed(2)} s`}
                >
                  <div className="wcm-line" />
                  <span className="wcm-badge">{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading skeleton */}
        {!isReady && (
          <div className="waveform-loading" aria-label="Loading waveform…">
            <div className="wl-pulse" />
          </div>
        )}
      </div>

      {/* ── Controls row ─────────────────────────────────────────────────── */}
      <div className="waveform-footer">
        <button
          className="wf-play-btn"
          onClick={handlePlayPause}
          disabled={!isReady}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <span className="wf-info">
          {isReady
            ? `${wsDuration.toFixed(1)} s · ${cuePoints.length} cue${cuePoints.length !== 1 ? 's' : ''} · ${cuePoints.length + 1} sample${cuePoints.length + 1 !== 1 ? 's' : ''}`
            : 'Decoding…'}
        </span>
      </div>
    </div>
  );
}
