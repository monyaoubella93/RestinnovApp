import { useRef, useState } from 'react'

export type RecordingState = 'idle' | 'recording' | 'recorded'

interface UseAudioRecorderOptions {
  filename: string
  micErrorMessage?: string
}

/**
 * Shared mic-recording logic (record/stop/preview/reset), extracted from
 * the pattern used for signalement audio and ticket assignment audio --
 * reuse this instead of duplicating MediaRecorder wiring in a new screen.
 */
export function useAudioRecorder({ filename, micErrorMessage = "Impossible d'accéder au micro." }: UseAudioRecorderOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Recording requires MediaRecorder + getUserMedia, which aren't always
  // available (older browsers, non-HTTPS contexts, denied permissions,
  // headless test environments) -- feature-detect and degrade gracefully
  // instead of letting the mic button crash the page.
  const micSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const startRecording = async () => {
    setError(null)
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
    } catch {
      setError(micErrorMessage)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecordingState('recorded')
  }

  const resetAudio = () => {
    setAudioFile(null)
    setAudioPreviewUrl(null)
    setRecordingState('idle')
  }

  return {
    recordingState,
    audioFile,
    audioPreviewUrl,
    error,
    micSupported,
    startRecording,
    stopRecording,
    resetAudio,
  }
}
