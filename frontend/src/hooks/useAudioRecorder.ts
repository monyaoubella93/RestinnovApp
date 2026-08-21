import { useEffect, useRef, useState } from 'react'

/** Matches the backend's audio size budget (max:5120 KB) at a normal
 * compressed bitrate -- 2 minutes keeps every recording well under it. */
export const MAX_RECORDING_SECONDS = 120

export type RecordingState = 'idle' | 'recording' | 'recorded'

interface UseAudioRecorderOptions {
  /** File name given to the recorded Blob (extension matches the MediaRecorder mimeType). */
  filename: string
  /** Message shown when getUserMedia is denied/unavailable -- left to the caller so it can be translated. */
  micErrorMessage: string
}

/**
 * Shared microphone-recording logic for the three places that capture an
 * audio motif/message (SignalerProblemeSection, RefuserModal,
 * TicketsMaintenanceSection's AssignerForm). Auto-stops at
 * MAX_RECORDING_SECONDS so no one accidentally records past the backend's
 * audio size limit, and exposes elapsedSeconds for a visual countdown.
 */
export function useAudioRecorder({ filename, micErrorMessage }: UseAudioRecorderOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [autoStopped, setAutoStopped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef(0)

  const micSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    clearTimer()
    setRecordingState('recorded')
  }

  const startRecording = async () => {
    setError(null)
    setAutoStopped(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const file = new File([blob], filename, { type: blob.type })
        setAudioFile(file)
        setAudioPreviewUrl(URL.createObjectURL(file))
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingState('recording')
      elapsedRef.current = 0
      setElapsedSeconds(0)
      intervalRef.current = setInterval(() => {
        elapsedRef.current += 1
        setElapsedSeconds(elapsedRef.current)
        if (elapsedRef.current >= MAX_RECORDING_SECONDS) {
          setAutoStopped(true)
          stopRecording()
        }
      }, 1000)
    } catch {
      setError(micErrorMessage)
    }
  }

  const resetAudio = () => {
    setAudioFile(null)
    setAudioPreviewUrl(null)
    setRecordingState('idle')
    setElapsedSeconds(0)
    setAutoStopped(false)
  }

  // Stop any in-progress recording (mic stream + timer) if the component
  // unmounts mid-recording, so the mic indicator doesn't stay lit forever.
  useEffect(() => {
    return () => {
      clearTimer()
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return {
    recordingState,
    audioFile,
    audioPreviewUrl,
    elapsedSeconds,
    autoStopped,
    error,
    micSupported,
    startRecording,
    stopRecording,
    resetAudio,
  }
}
