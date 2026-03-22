import { useEffect, useRef } from 'react'
import { TURNSTILE_ACTION } from '../lib/submitLead'

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script'
const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstileLoaderPromise

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is only available in the browser.'))
  }

  if (window.turnstile?.render) {
    return Promise.resolve(window.turnstile)
  }

  if (!turnstileLoaderPromise) {
    turnstileLoaderPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID)
      const script = existingScript ?? document.createElement('script')

      const handleLoad = () => {
        cleanup()

        if (window.turnstile?.render) {
          resolve(window.turnstile)
          return
        }

        turnstileLoaderPromise = null
        reject(new Error('Turnstile did not finish loading.'))
      }

      const handleError = () => {
        cleanup()
        turnstileLoaderPromise = null
        reject(new Error('Turnstile failed to load.'))
      }

      const cleanup = () => {
        script.removeEventListener('load', handleLoad)
        script.removeEventListener('error', handleError)
      }

      script.addEventListener('load', handleLoad)
      script.addEventListener('error', handleError)

      if (!existingScript) {
        script.id = TURNSTILE_SCRIPT_ID
        script.src = TURNSTILE_SCRIPT_SRC
        script.async = true
        script.defer = true
        document.head.appendChild(script)
        return
      }

      if (window.turnstile?.render) {
        handleLoad()
      }
    })
  }

  return turnstileLoaderPromise
}

function TurnstileWidget({
  locale = 'en',
  onError,
  onExpire,
  onTokenChange,
}) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const onErrorRef = useRef(onError)
  const onExpireRef = useRef(onExpire)
  const onTokenChangeRef = useRef(onTokenChange)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  }, [onTokenChange])

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()
    const containerElement = containerRef.current

    if (!siteKey) {
      onErrorRef.current?.(
        new Error('Missing VITE_TURNSTILE_SITE_KEY configuration.'),
      )
      return undefined
    }

    let isActive = true
    onTokenChangeRef.current?.('')

    loadTurnstileScript()
      .then((turnstile) => {
        if (!isActive || !containerElement) {
          return
        }

        widgetIdRef.current = turnstile.render(containerElement, {
          action: TURNSTILE_ACTION,
          appearance: 'always',
          language: locale === 'es' ? 'es' : 'en',
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => {
            if (!isActive) {
              return
            }

            onTokenChangeRef.current?.(token)
          },
          'error-callback': () => {
            if (!isActive) {
              return
            }

            onTokenChangeRef.current?.('')
            onErrorRef.current?.(new Error('Turnstile challenge failed.'))
          },
          'expired-callback': () => {
            if (!isActive) {
              return
            }

            onTokenChangeRef.current?.('')
            onExpireRef.current?.()
          },
          'timeout-callback': () => {
            if (!isActive) {
              return
            }

            onTokenChangeRef.current?.('')
            onExpireRef.current?.()
          },
        })
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        onTokenChangeRef.current?.('')
        onErrorRef.current?.(error)
      })

    return () => {
      isActive = false

      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }

      if (containerElement) {
        containerElement.textContent = ''
      }
    }
  }, [locale])

  return (
    <div className="contact-form__captcha-shell">
      <div ref={containerRef} className="contact-form__captcha-widget" />
    </div>
  )
}

export default TurnstileWidget
