import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import i18n, { LANGUAGE_STORAGE_KEY } from './index'
import { LanguageSwitcher } from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  afterEach(() => {
    void i18n.changeLanguage('fr')
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  })

  it('affiche "FR / عربي" et bascule vers l\'arabe au clic', async () => {
    const user = userEvent.setup()
    render(<LanguageSwitcher />)

    const button = screen.getByRole('button', { name: /changer la langue/i })
    expect(button).toHaveTextContent('FR')
    expect(button).toHaveTextContent('عربي')

    await user.click(button)

    expect(i18n.language).toBe('ar')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar')
  })

  it('bascule de nouveau vers le français à un second clic', async () => {
    const user = userEvent.setup()
    render(<LanguageSwitcher />)

    const button = screen.getByRole('button', { name: /changer la langue/i })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: /تغيير اللغة/i }))

    expect(i18n.language).toBe('fr')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr')
  })
})
