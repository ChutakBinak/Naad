import type { CuePoint } from '../types';

interface CueListProps {
  cuePoints: CuePoint[];
  isRecording: boolean;
}

export function CueList({ cuePoints, isRecording }: CueListProps) {
  return (
    <div className="cue-section">
      <div className="cue-header">
        <span className="cue-label">CUE POINTS</span>
        <span className="cue-count">{cuePoints.length}</span>
      </div>

      {cuePoints.length === 0 ? (
        <p className="cue-empty">
          {isRecording
            ? 'Press Space or tap Cue to mark a boundary'
            : 'No cue points recorded'}
        </p>
      ) : (
        <ul className="cue-list">
          {cuePoints.map((cue, i) => (
            <li key={i} className="cue-item">
              <span className="cue-index">{i + 1}</span>
              <span className="cue-time">{cue.label}</span>
              {i === 0 && (
                <span className="cue-from">from start</span>
              )}
              {i > 0 && (
                <span className="cue-from">
                  +{formatDelta(cue.timestamp - cuePoints[i - 1].timestamp)}
                </span>
              )}
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
    </div>
  );
}

function formatDelta(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(2);
  return `${s}s`;
}
