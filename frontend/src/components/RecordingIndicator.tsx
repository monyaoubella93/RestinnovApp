function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

interface RecordingIndicatorProps {
  elapsedSeconds: number
  maxSeconds: number
}

/** Countdown timer + filling bar shown while recording, so the max
 * duration never comes as a surprise auto-cutoff. */
export function RecordingIndicator({ elapsedSeconds, maxSeconds }: RecordingIndicatorProps) {
  const pct = Math.min(100, (elapsedSeconds / maxSeconds) * 100)

  return (
    <div className="flex w-full max-w-[9rem] flex-col items-center gap-1">
      <span className="font-mono text-xs font-bold text-danger" data-testid="recording-timer">
        {formatSeconds(elapsedSeconds)} / {formatSeconds(maxSeconds)}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-danger-bg">
        <div
          className="h-full rounded-full bg-danger transition-[width]"
          style={{ width: `${pct}%` }}
          data-testid="recording-progress"
        />
      </div>
    </div>
  )
}
