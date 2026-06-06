interface TimerProps {
  elapsed: number;
  isRecording: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export function Timer({ elapsed, isRecording }: TimerProps) {
  return (
    <div className="timer-display">
      <span className={`timer ${isRecording ? 'timer--active' : ''}`}>
        {formatTime(elapsed)}
      </span>
      {isRecording && <span className="recording-dot" aria-label="Recording" />}
    </div>
  );
}
