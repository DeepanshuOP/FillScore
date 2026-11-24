'use client'

import { useLayoutEffect } from 'react'

/**
 * Marks <body> with `data-app` while an app page is on screen. Radix and Vaul render menus, sheets and dialogs in a portal under
 * <body>, outside the app's wrapper; the mark gives them the app tokens (tokens.css `[data-app]`). It is removed when the app
 * unmounts, so the marketing site's popups keep the paper tone. The server HTML already wraps the app in `data-app`, so there is
 * no flash.
 */
export function AppScope() {
  useLayoutEffect(() => {
    document.body.setAttribute('data-app', '')
    return () => document.body.removeAttribute('data-app')
  }, [])
  return null
}
