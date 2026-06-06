import type { CuePoint } from '../types';
import { formatDelta } from '../utils/time';

interface CueListProps {
  cuePoints: CuePoint[];
  isRecording: boolean;
}

export function CueList({ cuePoints, isRecording }: CueListProps) {
  return (
    <section className="cue-section">
      <div className="cue-header">
        <span className="cue-label">CUE POINTS</span>
        <span className="cue-count">{cuePoints.length}</span>
      </div>

      {cuePoints.length === 0 ? (
        <p className="cue-empty">
          {isRecording
            ? 'Press Space or tap Cue to mark a sample boundary'
            : 'No cue points yet — start a recording'}
        </p>
      ) : (
        <ul className="cue-list" aria-label="Cue points">
          {cuePoints.map((cue, i) => (
            <li key={i} className="cue-item">
              <span className="cue-index" aria-label={`Cue ${i + 1}`}>{i + 1}</span>
              <span className="cue-time">{cue.label}</span>
              <span className="cue-from">
                {i === 0 ? 'from start' : `+${formatDelta(cue.timestamp - cuePoints[i - 1].timestamp)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {cuePoints.length > 0 && (
        <div className="sample-preview">
          <span className="sample-preview-label">
            {cuePoints.length + 1} sample{cuePoints.length + 1 !== 1 ? 's' : ''} when stopped
          </span>
        </div>
      )}
    </section>
  );
}
