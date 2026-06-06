import { useCallback } from 'react';
import { useSequencerStore } from '../store/sequencerStore';

interface TransportProps {
  onPlay:   () => void;
  onStop:   () => void;
  onRecord: () => void;
}

export function Transport({ onPlay, onStop, onRecord }: TransportProps) {
  const {
    bpm, bars, isLooping, metronomeOn, quantize,
    transportState, setBpm, setBars, setLooping, setMetronome, setQuantize,
  } = useSequencerStore();

  const isPlaying   = transportState === 'playing';
  const isRecording = transportState === 'recording';
  const isRunning   = isPlaying || isRecording;

  const handleBpmChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setBpm(Number(e.target.value)),
    [setBpm],
  );

  const handleBpmInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v)) setBpm(v);
    },
    [setBpm],
  );

  return (
    <div className="transport">
      {/* ── Playback controls ── */}
      <div className="transport-left">
        <button
          className={`tp-btn tp-btn--record ${isRecording ? 'tp-btn--active' : ''}`}
          onClick={isRunning ? onStop : onRecord}
          aria-label={isRecording ? 'Stop recording' : 'Record'}
          title="Record (R)"
        >
          {isRecording ? '■' : '●'}
        </button>

        <button
          className={`tp-btn tp-btn--play ${isPlaying ? 'tp-btn--active' : ''}`}
          onClick={isRunning ? onStop : onPlay}
          aria-label={isPlaying ? 'Stop' : 'Play'}
          title="Play (Space)"
        >
          {isRunning ? '■' : '▶'}
        </button>
      </div>

      {/* ── BPM ── */}
      <div className="transport-bpm">
        <label className="tp-label" htmlFor="bpm-slider">BPM</label>
        <div className="tp-bpm-row">
          <input
            id="bpm-slider"
            type="range"
            className="tp-bpm-slider"
            min={20}
            max={300}
            step={1}
            value={bpm}
            onChange={handleBpmChange}
          />
          <input
            type="number"
            className="tp-bpm-input"
            min={20}
            max={300}
            value={bpm}
            onChange={handleBpmInput}
            aria-label="BPM value"
          />
        </div>
      </div>

      {/* ── Bars ── */}
      <div className="transport-bars">
        <span className="tp-label">BARS</span>
        <div className="tp-bars-row">
          {[1, 2, 3, 4].map((b) => (
            <button
              key={b}
              className={`tp-bar-btn ${b === bars ? 'tp-bar-btn--active' : ''}`}
              onClick={() => setBars(b)}
              aria-label={`${b} bar${b > 1 ? 's' : ''}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toggles ── */}
      <div className="transport-toggles">
        <Toggle label="LOOP"  active={isLooping}    onChange={setLooping} />
        <Toggle label="CLICK" active={metronomeOn}   onChange={setMetronome} />
        <Toggle label="SNAP"  active={quantize}      onChange={setQuantize} />
      </div>
    </div>
  );
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`tp-toggle ${active ? 'tp-toggle--active' : ''}`}
      onClick={() => onChange(!active)}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
