import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'

export function LoginScreen() {
  const { login } = useAuth()
  const [telephone, setTelephone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(telephone, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="RestInnov" className="h-14 w-auto object-contain" />
          <h1 className="text-lg font-semibold text-gray-900">RestInnov</h1>
        </div>
        <p className="text-sm text-gray-500">Connectez-vous pour continuer.</p>

        <div>
          <label htmlFor="login_telephone" className="block text-sm font-medium text-gray-700">
            Téléphone
          </label>
          <input
            id="login_telephone"
            type="tel"
            required
            autoComplete="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-3 text-base"
          />
        </div>

        <div>
          <label htmlFor="login_password" className="block text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <input
            id="login_password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-3 text-base"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
