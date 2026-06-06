import { useCallback } from 'react';
import type { Sample } from '../types';
import { formatTime } from '../utils/time';
import { usePadSettingsStore, DEFAULT_SETTINGS } from '../store/padSettingsStore';

export interface PadData {
  id: string;
  number: number;
  sample: Sample | null;
  keyLabel: string;
}

interface PadProps {
  pad: PadData;
  isPlaying: boolean;
  isSelected: boolean;
  onTrigger: (pad: PadData) => void;
  onEdit:    (pad: PadData) => void;
}

export function Pad({ pad, isPlaying, isSelected, onTrigger, onEdit }: PadProps) {
  const isEmpty = pad.sample === null;
  const { getSettings } = usePadSettingsStore();
  const settings = getSettings(pad.id);
  const hasCustomSettings =
    settings.pitch   !== DEFAULT_SETTINGS.pitch   ||
    settings.speed   !== DEFAULT_SETTINGS.speed   ||
    settings.attack  !== DEFAULT_SETTINGS.attack  ||
    settings.decay   !== DEFAULT_SETTINGS.decay   ||
    settings.sustain !== DEFAULT_SETTINGS.sustain ||
    settings.release !== DEFAULT_SETTINGS.release;

  const handleClick = useCallback(() => {
    if (!isEmpty) onTrigger(pad);
  }, [isEmpty, onTrigger, pad]);

  const handleGear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(pad);
    },
    [onEdit, pad],
  );

  return (
    <button
      className={[
        'pad',
        isEmpty    ? 'pad--empty'    : 'pad--filled',
        isPlaying  ? 'pad--playing'  : '',
        isSelected ? 'pad--selected' : '',
      ].join(' ')}
      onClick={handleClick}
      disabled={isEmpty}
      aria-label={pad.sample ? `${pad.sample.label}, key ${pad.keyLabel}` : `Pad ${pad.number} empty`}
    >
      {/* Key label */}
      <span className="pad-key">{pad.keyLabel}</span>

      {/* Gear — must NOT be a <button> inside a <button> (invalid HTML breaks clicks) */}
      {!isEmpty && (
        <span
          role="button"
          tabIndex={0}
          className={`pad-gear ${hasCustomSettings ? 'pad-gear--active' : ''}`}
          onClick={handleGear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onEdit(pad);
            }
          }}
          aria-label={`Edit ${pad.sample!.label} settings`}
          title="Edit pad settings"
        >
          ⚙
        </span>
      )}

      {isEmpty ? (
        <span className="pad-empty-label">—</span>
      ) : (
        <>
          <span className="pad-sample-name">{pad.sample!.label}</span>
          <span className="pad-duration">{formatTime(pad.sample!.durationMs)}</span>
        </>
      )}

      {isPlaying && <span className="pad-ring" aria-hidden />}
    </button>
  );
}
