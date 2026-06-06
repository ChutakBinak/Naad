import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { Sample } from '../utils/audioSlicer';

interface SampleListProps {
  samples: Sample[];
  onNewRecording: () => void;
}

export function SampleList({ samples, onNewRecording }: SampleListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleExportAll = useCallback(() => {
    samples.forEach((s, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = s.url;
        a.download = `naad-sample-${String(s.index).padStart(2, '0')}.wav`;
        a.click();
      }, i * 150);
    });
  }, [samples]);

  return (
    <div className="sample-list-section">
      <div className="sl-toolbar">
        <div className="sl-title-row">
          <span className="sl-title">SAMPLES</span>
          <span className="sl-count">{samples.length}</span>
        </div>
        <div className="sl-actions">
          <button className="btn btn--export btn--sm" onClick={handleExportAll}>
            ↓ All WAV
          </button>
          <button className="btn btn--reset btn--sm" onClick={onNewRecording}>
            ↺ New
          </button>
        </div>
      </div>

      <ul className="sl-list">
        {samples.map((s) => (
          <SampleRow
            key={s.id}
            sample={s}
            activeId={activeId}
            onPlayStart={setActiveId}
          />
        ))}
      </ul>
    </div>
  );
}

function SampleRow({
  sample,
  activeId,
  onPlayStart,
}: {
  sample: Sample;
  activeId: string | null;
  onPlayStart: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef        = useRef<WaveSurfer | null>(null);
  const [isReady,   setIsReady]   = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (activeId && activeId !== sample.id && isPlaying) {
      wsRef.current?.pause();
    }
  }, [activeId, sample.id, isPlaying]);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container:     containerRef.current,
      waveColor:     '#2a2a2a',
      progressColor: '#c8ff00',
      cursorColor:   '#c8ff00',
      height:        48,
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

    return () => { ws.destroy(); wsRef.current = null; };
  }, [sample.url]);

  const handlePlay = useCallback(() => {
    if (!wsRef.current || !isReady) return;
    if (!isPlaying) onPlayStart(sample.id);
    wsRef.current.playPause();
  }, [isReady, isPlaying, onPlayStart, sample.id]);

  const handleDl = useCallback(() => {
    const a = document.createElement('a');
    a.href = sample.url;
    a.download = `naad-sample-${String(sample.index).padStart(2, '0')}.wav`;
    a.click();
  }, [sample.url, sample.index]);

  return (
    <li className={`sl-row ${isPlaying ? 'sl-row--active' : ''}`}>
      <div className="sl-row-header">
        <span className="sl-idx">{sample.index}</span>
        <div className="sl-meta">
          <span className="sl-label">{sample.label}</span>
          <span className="sl-range">{sample.timeRange}</span>
        </div>
        <div className="sl-btns">
          <button
            className={`sl-btn ${isPlaying ? 'sl-btn--active' : ''}`}
            onClick={handlePlay}
            disabled={!isReady}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="sl-btn" onClick={handleDl} aria-label="Download">
            ↓
          </button>
        </div>
      </div>

      <div
        className={`sl-wave ${isReady ? '' : 'sl-wave--loading'}`}
        ref={containerRef}
      />
    </li>
  );
}
