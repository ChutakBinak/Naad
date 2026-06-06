import { useCallback } from 'react';
import { useSequencerStore } from '../store/sequencerStore';
import type { Sample } from '../types';

interface StepGridProps {
  samples: Sample[];
}

const PAD_LABELS = ['Q','W','E','A','S','D','Z','X','C'];

export function StepGrid({ samples }: StepGridProps) {
  const { steps, bars, currentStep, toggleStep, clearTrack } = useSequencerStore();
  const totalSteps = bars * 16;

  const handleCellClick = useCallback(
    (padIndex: number, stepIndex: number) => toggleStep(padIndex, stepIndex),
    [toggleStep],
  );

  return (
    <div className="step-grid-wrapper">
      {/* Bar number markers */}
      <div className="sg-bar-markers">
        <div className="sg-row-label" /> {/* spacer for labels column */}
        <div className="sg-markers-inner" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
          {Array.from({ length: bars }, (_, b) => (
            <div
              key={b}
              className="sg-bar-marker"
              style={{ gridColumn: `${b * 16 + 1} / span 16` }}
            >
              Bar {b + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Grid rows */}
      <div className="step-grid">
        {steps.map((track, padIndex) => {
          const sample = samples[padIndex];
          const hasAny = track.some(Boolean);

          return (
            <div key={padIndex} className="sg-row">
              {/* Row label */}
              <div className="sg-row-label">
                <span className="sg-pad-key">{PAD_LABELS[padIndex]}</span>
                <span className="sg-pad-name">
                  {sample ? sample.label : <span className="sg-empty-name">—</span>}
                </span>
                {hasAny && (
                  <button
                    className="sg-clear-btn"
                    onClick={() => clearTrack(padIndex)}
                    aria-label={`Clear track ${padIndex + 1}`}
                    title="Clear track"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Step cells */}
              <div
                className="sg-cells"
                style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
              >
                {Array.from({ length: totalSteps }, (_, stepIndex) => {
                  const isActive   = track[stepIndex];
                  const isCurrent  = stepIndex === currentStep;
                  const isDownbeat = stepIndex % 16 === 0;
                  const isBeat     = stepIndex % 4 === 0;
                  const isEmpty    = !sample;

                  return (
                    <button
                      key={stepIndex}
                      className={[
                        'sg-cell',
                        isActive   ? 'sg-cell--on'       : 'sg-cell--off',
                        isCurrent  ? 'sg-cell--current'  : '',
                        isDownbeat ? 'sg-cell--downbeat'  : '',
                        isBeat     ? 'sg-cell--beat'      : '',
                        isEmpty    ? 'sg-cell--disabled'  : '',
                      ].join(' ')}
                      onClick={() => !isEmpty && handleCellClick(padIndex, stepIndex)}
                      disabled={isEmpty}
                      aria-label={`${sample?.label ?? 'empty'} step ${stepIndex + 1} ${isActive ? 'on' : 'off'}`}
                      aria-pressed={isActive}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
