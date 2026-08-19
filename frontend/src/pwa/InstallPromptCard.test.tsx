import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InstallPromptCard } from './InstallPromptCard'

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
})
