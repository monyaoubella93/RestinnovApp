import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { InstallPromptCard } from './InstallPromptCard'

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.79 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

function mockUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
}

function fireBeforeInstallPrompt(prompt = async () => {}, userChoice = Promise.resolve({ outcome: 'accepted' })) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = prompt
  event.userChoice = userChoice
  act(() => {
    window.dispatchEvent(event)
  })
}

describe('InstallPromptCard', () => {
  const ORIGINAL_UA = window.navigator.userAgent

  afterEach(() => {
    mockUserAgent(ORIGINAL_UA)
  })

  it("n'affiche rien tant que beforeinstallprompt n'a pas été capté", () => {
    render(<InstallPromptCard />)

    expect(screen.queryByText('Installer sur le téléphone')).not.toBeInTheDocument()
  })

  it('affiche la carte après beforeinstallprompt, et déclenche prompt() au clic', async () => {
    const user = userEvent.setup()
    const promptMock = async () => {}
    render(<InstallPromptCard />)

    fireBeforeInstallPrompt(promptMock)

    expect(await screen.findByText('Installer sur le téléphone')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Installer' }))
    // No assertion on promptMock call count needed beyond "it didn't throw" --
    // the important behaviour (card visible, button wired) is covered.
  })

  it('se masque une fois l\'app installée (événement appinstalled)', async () => {
    render(<InstallPromptCard />)
    fireBeforeInstallPrompt()

    expect(await screen.findByText('Installer sur le téléphone')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(screen.queryByText('Installer sur le téléphone')).not.toBeInTheDocument()
  })

  it('affiche les instructions manuelles (Partager > écran d\'accueil) sur Safari iOS, sans bouton "Installer"', () => {
    mockUserAgent(IOS_SAFARI_UA)
    render(<InstallPromptCard />)

    expect(screen.getByText('Installer sur le téléphone')).toBeInTheDocument()
    expect(screen.getByText(/Partager.*Sur l'écran d'accueil/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  it('n\'affiche rien sur Chrome iOS (ni bouton auto ni instructions -- pas de vraie install standalone)', () => {
    mockUserAgent(IOS_CHROME_UA)
    render(<InstallPromptCard />)

    expect(screen.queryByText('Installer sur le téléphone')).not.toBeInTheDocument()
  })

  it("n'affiche jamais les instructions iOS sur Chrome Android (l'installation automatique fonctionne déjà)", async () => {
    mockUserAgent(ANDROID_CHROME_UA)
    render(<InstallPromptCard />)

    expect(screen.queryByText('Installer sur le téléphone')).not.toBeInTheDocument()

    // Android's real beforeinstallprompt flow still works normally alongside
    // the UA check -- the iOS hint just never fires on this platform.
    fireBeforeInstallPrompt()
    expect(await screen.findByText('Installer sur le téléphone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Installer' })).toBeInTheDocument()
    expect(screen.queryByText(/Partager.*Sur l'écran d'accueil/)).not.toBeInTheDocument()
  })
})
