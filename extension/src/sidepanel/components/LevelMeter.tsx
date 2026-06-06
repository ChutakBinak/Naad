import { useEffect, useRef } from 'react';

interface Props {
  analyserNode: AnalyserNode | null;
}

const BAR_COUNT = 20;

export function LevelMeter({ analyserNode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!analyserNode) {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const buffer = new Uint8Array(analyserNode.fftSize);

    const draw = () => {
      analyserNode.getByteTimeDomainData(buffer);

      let sum = 0;
      for (const v of buffer) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      const rms = Math.min(Math.sqrt(sum / buffer.length) * 6, 1);

      const w = canvas.width;
      const h = canvas.height;
      const barW = w / BAR_COUNT;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < BAR_COUNT; i++) {
        const fraction = i / BAR_COUNT;
        const active   = fraction < rms;

        let fill: string;
        if (active) {
          if (fraction < 0.6)  fill = '#4a9eff';
          else if (fraction < 0.85) fill = '#f59e0b';
          else fill = '#ef4444';
        } else {
          fill = '#1e293b';
        }

        ctx.fillStyle = fill;
        ctx.fillRect(Math.round(i * barW) + 1, 2, Math.round(barW) - 2, h - 4);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [analyserNode]);

  return (
    <div className="level-meter-wrap" role="meter" aria-label="Recording level">
      <span className="lm-label">REC</span>
      <canvas ref={canvasRef} className="lm-canvas" width={160} height={18} />
    </div>
  );
}
