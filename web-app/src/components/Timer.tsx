import { formatTime } from '../utils/time';

interface TimerProps {
  elapsed: number;
  isRecording: boolean;
}

export function Timer({ elapsed, isRecording }: TimerProps) {
  return (
    <div className="timer-display">
      <span className={`timer ${isRecording ? 'timer--active' : ''}`}>
        {formatTime(elapsed)}
      </span>
      {isRecording && <span className="recording-dot" aria-label="Recording in progress" />}
    </div>
  );
}
