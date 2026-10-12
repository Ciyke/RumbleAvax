import { useCallback, useEffect, useState } from 'react'

const KEY = 'rumble-theme'

function initial() {
  const stored = localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Light/dark toggle, persisted per origin.
 *
 * Note: hunt. and bet. are separate origins, so a preference set on one does
 * not carry to the other. That is a browser rule, not a bug.
 */
export function useTheme() {
  const [theme, setTheme] = useState(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
