import { useState, useCallback } from 'react';
import { SampleCard } from './SampleCard';
import type { Sample } from '../types';

interface SampleGridProps {
  samples: Sample[];
  onNewRecording: () => void;
}

export function SampleGrid({ samples, onNewRecording }: SampleGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handlePlayStart = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleExportAll = useCallback(() => {
    // Stagger downloads slightly so browser doesn't block them
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
    <section className="sample-grid-section">
      {/* Toolbar */}
      <div className="sg-toolbar">
        <div className="sg-title-row">
          <span className="sg-title">SAMPLES</span>
          <span className="sg-count">{samples.length}</span>
        </div>
        <div className="sg-actions">
          <button className="btn btn--export" onClick={handleExportAll}>
            <span className="btn-icon">↓</span>
            Export All WAV
          </button>
          <button className="btn btn--reset" onClick={onNewRecording}>
            <span className="btn-icon">↺</span>
            New Recording
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="sample-grid">
        {samples.map((s) => (
          <SampleCard
            key={s.id}
            sample={s}
            activeId={activeId}
            onPlayStart={handlePlayStart}
          />
        ))}
      </div>
    </section>
  );
}
