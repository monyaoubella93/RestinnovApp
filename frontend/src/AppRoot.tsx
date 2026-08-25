import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AgentWorkspace } from './AgentWorkspace'
import App from './App'
import { useAuth } from './auth/AuthContext'
import { LoginScreen } from './auth/LoginScreen'
import i18n from './i18n'
import { MaintenanceWorkspace } from './MaintenanceWorkspace'

/**
 * "/" is the Manager app, "/menage" is the cleaning agent's own space,
 * "/maintenance" is the maintenance agent's own space -- strictly one role
 * per route. A role visiting the wrong route is bounced to the one
 * matching their account, never shown another role's screen.
 */
function homeRouteForRole(role: string): string {
  if (role === 'menage') return '/menage'
  if (role === 'maintenance') return '/maintenance'
  return '/'
}

export function AppRoot() {
  const { user } = useAuth()

  // The language switcher belongs to the menage/maintenance agent
  // workspaces only, and its choice must stay scoped to the agent's own
  // screen -- it never persists to the backend, only to this browser's
  // localStorage. But i18next itself is a single shared instance, so on a
  // browser that also hosts a Manager session (a shared device, or the
  // same tab switching accounts), a language previously picked by an
  // agent would otherwise leak into the Manager's own screens too. The
  // Manager always works in French, unconditionally.
  useEffect(() => {
    if (user?.role === 'manager' && i18n.language !== 'fr') {
      void i18n.changeLanguage('fr')
    }
  }, [user?.role])

  if (!user) {
    return <LoginScreen />
  }

  return (
    <Routes>
      <Route path="/" element={user.role === 'manager' ? <App /> : <Navigate to={homeRouteForRole(user.role)} replace />} />
      <Route
        path="/menage"
        element={user.role === 'menage' ? <AgentWorkspace /> : <Navigate to={homeRouteForRole(user.role)} replace />}
      />
      <Route
        path="/maintenance"
        element={
          user.role === 'maintenance' ? <MaintenanceWorkspace /> : <Navigate to={homeRouteForRole(user.role)} replace />
        }
      />
      <Route path="*" element={<Navigate to={homeRouteForRole(user.role)} replace />} />
    </Routes>
  )
}
