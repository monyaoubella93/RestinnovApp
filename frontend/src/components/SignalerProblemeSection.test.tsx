import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignalerProblemeSection } from './SignalerProblemeSection'
import { ApiError } from '../api'

class FakeMediaRecorder {
  static isTypeSupported = () => true
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  mimeType = 'audio/webm'
  stream: MediaStream
  constructor(stream: MediaStream) {
    this.stream = stream
  }
  start() {
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
  }
  stop() {
    this.onstop?.()
  }
}

function makeFile(name = 'degat.jpg', type = 'image/jpeg') {
  return new File(['contenu'], name, { type })
}

describe('SignalerProblemeSection', () => {
  const originalMediaRecorder = window.MediaRecorder
  const originalMediaDevices = navigator.mediaDevices

  beforeEach(() => {
    // jsdom has neither MediaRecorder nor getUserMedia -- match that by
    // default so tests exercise the "not supported" degradation path
    // unless a test explicitly stubs them back in.
    // @ts-expect-error -- deleting a possibly-undefined global for the test
    delete window.MediaRecorder
  })

  afterEach(() => {
    window.MediaRecorder = originalMediaRecorder
    Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true })
    vi.restoreAllMocks()
  })

  it('le bouton "Signaler un problème" est actif et ouvre le formulaire', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    const button = screen.getByRole('button', { name: /signaler un problème/i })
    expect(button).toBeEnabled()

    await user.click(button)
    expect(screen.getByRole('heading', { name: /signaler un problème/i })).toBeInTheDocument()
  })

  it('force la caméra -- accept="image/*" capture="environment"', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))

    const input = screen.getByLabelText(/photo du problème/i)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
  })

  it('affiche un aperçu après avoir pris une photo', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.upload(screen.getByLabelText(/photo du problème/i), makeFile())

    expect(await screen.findByAltText(/aperçu de la photo/i)).toBeInTheDocument()
  })

  it('permet de sélectionner plusieurs photos et affiche un aperçu de chacune', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.upload(screen.getByLabelText(/photo du problème/i), [makeFile('a.jpg'), makeFile('b.jpg')])

    expect(await screen.findByAltText('Aperçu de la photo 1')).toBeInTheDocument()
    expect(screen.getByAltText('Aperçu de la photo 2')).toBeInTheDocument()
  })

  it('permet de retirer une photo sélectionnée avant envoi', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.upload(screen.getByLabelText(/photo du problème/i), [makeFile('a.jpg'), makeFile('b.jpg')])
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1' }))

    expect(screen.queryByAltText('Aperçu de la photo 2')).not.toBeInTheDocument()
    expect(screen.getByAltText('Aperçu de la photo 1')).toBeInTheDocument()
  })

  it('envoie plusieurs photos sélectionnées', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn().mockResolvedValue(undefined)
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    const photoA = makeFile('a.jpg')
    const photoB = makeFile('b.jpg')
    await user.upload(screen.getByLabelText(/photo du problème/i), [photoA, photoB])
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() =>
      expect(onSignaler).toHaveBeenCalledWith(10, { photos: [photoA, photoB], audio: null, description: null }),
    )
  })

  it('indique que l\'enregistrement audio est indisponible quand MediaRecorder n\'existe pas', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))

    expect(screen.getByText(/audio non disponible/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enregistrer un message audio/i })).not.toBeInTheDocument()
  })

  it('envoie le signalement avec la photo et la description saisies', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn().mockResolvedValue(undefined)
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photo du problème/i), photo)
    await user.type(screen.getByLabelText(/description/i), 'Douche bouchée')
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() =>
      expect(onSignaler).toHaveBeenCalledWith(10, { photos: [photo], audio: null, description: 'Douche bouchée' }),
    )
    expect(await screen.findByTestId('signalement-confirmation')).toBeInTheDocument()
  })

  it('refuse l\'envoi sans photo, audio ni description', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(screen.getByText(/ajoutez au moins une photo, un audio ou une description/i)).toBeInTheDocument()
    expect(onSignaler).not.toHaveBeenCalled()
  })

  it('le bouton Annuler referme le formulaire sans envoyer', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.type(screen.getByLabelText(/description/i), 'Test')
    await user.click(screen.getByRole('button', { name: /annuler/i }))

    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument()
    expect(onSignaler).not.toHaveBeenCalled()
  })

  it('propose de gros boutons ronds photo/micro pour signaler sans avoir à écrire', async () => {
    const user = userEvent.setup()
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))

    expect(screen.getByRole('button', { name: /ouvrir l'appareil photo/i })).toBeInTheDocument()
  })

  it('affiche un indicateur visuel pulsant pendant l\'enregistrement audio', async () => {
    const user = userEvent.setup()

    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    class FakeMediaRecorder {
      static isTypeSupported = () => true
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      mimeType = 'audio/webm'
      stream: MediaStream
      constructor(stream: MediaStream) {
        this.stream = stream
      }
      start() {}
      stop() {
        this.onstop?.()
      }
    }
    // @ts-expect-error -- assigning a minimal fake for the test
    window.MediaRecorder = FakeMediaRecorder

    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.click(screen.getByRole('button', { name: /enregistrer un message audio/i }))

    const indicator = await screen.findByTestId('recording-indicator')
    expect(indicator.querySelector('.animate-ping')).toBeInTheDocument()
  })

  it('propose l\'enregistrement audio quand MediaRecorder est disponible, et l\'envoie', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn().mockResolvedValue(undefined)

    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    class FakeMediaRecorder {
      static isTypeSupported = () => true
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      mimeType = 'audio/webm'
      stream: MediaStream
      constructor(stream: MediaStream) {
        this.stream = stream
      }
      start() {
        this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
      }
      stop() {
        this.onstop?.()
      }
    }
    // @ts-expect-error -- assigning a minimal fake for the test
    window.MediaRecorder = FakeMediaRecorder

    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.click(screen.getByRole('button', { name: /enregistrer un message audio/i }))

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }))
    await user.click(await screen.findByRole('button', { name: /arrêter l'enregistrement/i }))

    expect(await screen.findByRole('button', { name: /recommencer l'enregistrement/i })).toBeInTheDocument()
    expect(fakeTrack.stop).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() => expect(onSignaler).toHaveBeenCalledTimes(1))
    const [, input] = onSignaler.mock.calls[0]
    expect(input.photos).toEqual([])
    expect(input.audio).toBeInstanceOf(File)
    expect(input.description).toBeNull()
  })

  it('affiche un message clair quand la photo est trop lourde', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn().mockRejectedValue(new ApiError('The photo field must not be greater than 10240 kilobytes.', 422))
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.upload(screen.getByLabelText(/photo du problème/i), makeFile())
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })

  it('affiche un message clair quand la taille dépasse la limite côté serveur (413)', async () => {
    const user = userEvent.setup()
    const onSignaler = vi.fn().mockRejectedValue(new ApiError('Le fichier envoyé est trop volumineux.', 413))
    render(<SignalerProblemeSection missionMenageId={10} onSignaler={onSignaler} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.upload(screen.getByLabelText(/photo du problème/i), makeFile())
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })

  it('arrête automatiquement l\'enregistrement audio à 2 minutes et affiche un minuteur visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })

    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    // @ts-expect-error -- assigning a minimal fake for the test
    window.MediaRecorder = FakeMediaRecorder

    render(<SignalerProblemeSection missionMenageId={10} onSignaler={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.click(screen.getByRole('button', { name: /enregistrer un message audio/i }))

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())

    expect(await screen.findByTestId('recording-timer')).toHaveTextContent('0:00 / 2:00')

    await vi.advanceTimersByTimeAsync(65_000)
    expect(screen.getByTestId('recording-timer')).toHaveTextContent('1:05 / 2:00')
    expect(screen.getByRole('button', { name: /arrêter l'enregistrement/i })).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(60_000)

    expect(await screen.findByRole('button', { name: /recommencer l'enregistrement/i })).toBeInTheDocument()
    expect(fakeTrack.stop).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
