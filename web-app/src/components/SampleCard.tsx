import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { Sample } from '../types';
import { formatTime } from '../utils/time';

interface SampleCardProps {
  sample: Sample;
  /** Whether all cards are in "stop all" mode */
  onPlayStart?: (id: string) => void;
  activeId?: string | null;
}

export function SampleCard({ sample, onPlayStart, activeId }: SampleCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef        = useRef<WaveSurfer | null>(null);
  const [isReady,   setIsReady]   = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Stop playback when another card starts playing
  useEffect(() => {
    if (activeId && activeId !== sample.id && isPlaying) {
      wsRef.current?.pause();
    }
  }, [activeId, sample.id, isPlaying]);

  // Create WaveSurfer instance once the container mounts
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container:     containerRef.current,
      waveColor:     '#2a2a2a',
      progressColor: '#c8ff00',
      cursorColor:   '#c8ff00',
      height:        72,
      barWidth:      2,
      barGap:        1,
      barRadius:     2,
      normalize:     true,
      interact:      true,
    });

    ws.on('ready',  () => setIsReady(true));
    ws.on('play',   () => setIsPlaying(true));
    ws.on('pause',  () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    ws.load(sample.url);
    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [sample.url]);

  const handlePlayPause = useCallback(() => {
    if (!wsRef.current || !isReady) return;
    if (!isPlaying) onPlayStart?.(sample.id);
    wsRef.current.playPause();
  }, [isReady, isPlaying, onPlayStart, sample.id]);

  const handleDownload = useCallback(() => {
    const a = document.createElement('a');
    a.href = sample.url;
    a.download = `naad-sample-${String(sample.index).padStart(2, '0')}.wav`;
    a.click();
  }, [sample.url, sample.index]);

  return (
    <article className="sample-card" data-playing={isPlaying}>
      {/* Header */}
      <div className="sc-header">
        <div className="sc-meta">
          <span className="sc-index">{sample.index}</span>
          <div className="sc-info">
            <span className="sc-label">{sample.label}</span>
            <span className="sc-range">{sample.timeRange}</span>
          </div>
        </div>
        <span className="sc-duration">{formatTime(sample.durationMs)}</span>
      </div>

      {/* Waveform */}
      <div
        className={`sc-waveform ${isReady ? 'sc-waveform--ready' : 'sc-waveform--loading'}`}
        ref={containerRef}
      >
        {!isReady && (
          <div className="sc-loading">
            <span className="sc-loading-bar" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="sc-actions">
        <button
          className={`sc-btn sc-btn--play ${isPlaying ? 'sc-btn--active' : ''}`}
          onClick={handlePlayPause}
          disabled={!isReady}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          className="sc-btn sc-btn--dl"
          onClick={handleDownload}
          aria-label={`Download ${sample.label}`}
        >
          ↓ WAV
        </button>
      </div>
    </article>
  );
}
