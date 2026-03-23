import { useEffect, useState } from 'react'
import LeadForm from './components/LeadForm'

const MODAL_EXIT_MS = 180

function App() {
  const [isContactMounted, setIsContactMounted] = useState(false)
  const [isContactVisible, setIsContactVisible] = useState(false)
  const [formLocale, setFormLocale] = useState('es')

  const openContact = () => {
    setIsContactMounted(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setIsContactVisible(true)
      })
    })
  }

  const closeContact = () => {
    setIsContactVisible(false)
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContact()
      }
    }

    document.body.style.overflow = isContactMounted ? 'hidden' : ''
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isContactMounted])

  useEffect(() => {
    if (isContactVisible || !isContactMounted) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setIsContactMounted(false)
    }, MODAL_EXIT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isContactMounted, isContactVisible])

  const closeCopy =
    formLocale === 'es'
      ? {
          ariaLabel: 'Cerrar formulario de contacto',
        }
      : {
          ariaLabel: 'Close contact form',
        }

  return (
    <main id="top" className="page-shell">
      <section className="landing-layout">
        <article className="landing-card panel">
          <div className="hero-media landing-media" aria-hidden="true">
            <img
              src="/Lizette.JPEG"
              alt="Lizette Malagon portrait"
              className="landing-portrait-image"
            />
          </div>

          <div className="hero-copy landing-content">
            <div className="landing-brand">
              <img
                src="/duarte_logo.png"
                alt="Duarte Realty Co. logo"
                className="landing-wordmark"
              />
            </div>

            <header className="landing-header">
              <h1 className="landing-title">
                Lizette
                <br />
                Malagon
              </h1>
              <p className="landing-subtitle">
                <span>Agente de bienes raices</span>
                <br />
                <span>Real Estate Agent</span>
              </p>
            </header>

            <button
              type="button"
              className="button-primary landing-button"
              onClick={openContact}
              aria-haspopup="dialog"
              aria-expanded={isContactVisible}
              aria-controls="contact"
            >
              Contact
            </button>
          </div>
        </article>
      </section>

      {isContactMounted ? (
        <div
          className={`modal-shell ${isContactVisible ? 'is-visible' : ''}`}
          onClick={closeContact}
        >
          <section
            className={`modal-card ${isContactVisible ? 'is-visible' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeContact}
              aria-label={closeCopy.ariaLabel}
            >
              x
            </button>
            <LeadForm
              autoFocus={isContactVisible}
              locale={formLocale}
              onLocaleChange={setFormLocale}
              onSuccessComplete={closeContact}
            />
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
