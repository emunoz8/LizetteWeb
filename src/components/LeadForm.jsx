import { useEffect, useState } from 'react'
import TurnstileWidget from './TurnstileWidget'
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MIN_SUBMIT_INTERVAL_MS,
  markSubmission,
  shouldThrottleSubmission,
  submitLead,
  validateLead,
} from '../lib/submitLead'

const emptyValues = {
  name: '',
  email: '',
  phone: '',
  message: '',
  companyWebsite: '',
}

const SUCCESS_SCREEN_MS = 4200

const formCopy = {
  es: {
    languageLabel: 'Idioma',
    languages: {
      es: 'Espanol',
      en: 'English',
    },
    eyebrow: 'Consulta',
    title: 'Deje sus datos',
    copy: 'Comparta su informacion de contacto y un breve mensaje. Nos comunicaremos con usted lo antes posible.',
    labels: {
      name: 'Nombre',
      email: 'Correo',
      phone: 'Telefono',
      message: 'Mensaje',
      securityCheck: 'Verificacion',
      honeypot: 'Deje este campo vacio',
    },
    placeholders: {
      name: 'Su nombre completo',
      email: 'nombre@ejemplo.com',
      phone: '312 555 1234',
      message: 'Como podemos ayudarle?',
    },
    validation: {
      nameRequired: 'Agregue su nombre.',
      nameTooLong: `Mantenga su nombre por debajo de ${MAX_NAME_LENGTH} caracteres.`,
      emailRequired: 'Agregue un correo electronico.',
      emailTooLong: `Mantenga su correo por debajo de ${MAX_EMAIL_LENGTH} caracteres.`,
      emailInvalid: 'Ingrese un correo electronico valido.',
      phoneRequired: 'Agregue un numero de telefono.',
      phoneTooLong: `Mantenga su numero de telefono por debajo de ${MAX_PHONE_LENGTH} caracteres.`,
      phoneInvalid: 'Ingrese un numero de telefono valido.',
      messageRequired: 'Comparta un mensaje breve.',
      messageTooLong: `Mantenga su mensaje por debajo de ${MAX_MESSAGE_LENGTH} caracteres.`,
    },
    status: {
      requiredFields: 'Complete los campos obligatorios.',
      honeypotSuccess: 'Gracias. Su mensaje ha sido recibido.',
      throttle: (seconds) =>
        `Espere ${seconds} segundos antes de enviar otro mensaje.`,
      success: 'Gracias. Su consulta fue enviada correctamente.',
      missingEndpoint:
        'Agregue la URL de Google Apps Script en VITE_FORM_ENDPOINT antes de probar envios.',
      missingTurnstile:
        'Agregue la clave publica de Cloudflare Turnstile en VITE_TURNSTILE_SITE_KEY antes de probar envios.',
      captchaRequired:
        'Complete la verificacion de seguridad antes de enviar su mensaje.',
      captchaExpired:
        'La verificacion caduco. Complete el reto nuevamente.',
      captchaLoadError:
        'No pudimos cargar la verificacion de seguridad. Recargue la pagina e intente de nuevo.',
      genericError:
        'No pudimos enviar su mensaje. Intente de nuevo en breve.',
    },
    submit: {
      idle: 'Enviar mensaje',
      pending: 'Enviando...',
    },
    successScreen: {
      title: 'Gracias por su mensaje',
      copy: 'Su consulta fue enviada correctamente.',
    },
  },
  en: {
    languageLabel: 'Language',
    languages: {
      es: 'Spanish',
      en: 'English',
    },
    eyebrow: 'Inquiry',
    title: 'Leave your details',
    copy: 'Share your contact information and a short note. A follow-up will be sent as soon as possible.',
    labels: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      message: 'Message',
      securityCheck: 'Security check',
      honeypot: 'Leave this field empty',
    },
    placeholders: {
      name: 'Your full name',
      email: 'name@example.com',
      phone: '(312) 555-1234',
      message: 'How can we help you?',
    },
    validation: {
      nameRequired: 'Please add your name.',
      nameTooLong: `Please keep your name under ${MAX_NAME_LENGTH} characters.`,
      emailRequired: 'Please add an email address.',
      emailTooLong: `Please keep your email under ${MAX_EMAIL_LENGTH} characters.`,
      emailInvalid: 'Please enter a valid email address.',
      phoneRequired: 'Please add a phone number.',
      phoneTooLong: `Please keep your phone number under ${MAX_PHONE_LENGTH} characters.`,
      phoneInvalid: 'Please enter a valid phone number.',
      messageRequired: 'Please share a short message.',
      messageTooLong: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
    },
    status: {
      requiredFields: 'Please complete the required fields.',
      honeypotSuccess: 'Thank you. Your message has been received.',
      throttle: (seconds) =>
        `Please wait ${seconds} seconds before sending another message.`,
      success: 'Thank you. Your inquiry was sent successfully.',
      missingEndpoint:
        'Add your Google Apps Script URL to VITE_FORM_ENDPOINT before testing submissions.',
      missingTurnstile:
        'Add your Cloudflare Turnstile site key to VITE_TURNSTILE_SITE_KEY before testing submissions.',
      captchaRequired:
        'Complete the security check before sending your message.',
      captchaExpired:
        'The security check expired. Please complete it again.',
      captchaLoadError:
        'We could not load the security check. Refresh the page and try again.',
      genericError:
        'We could not send your message. Please try again shortly.',
    },
    submit: {
      idle: 'Send message',
      pending: 'Sending...',
    },
    successScreen: {
      title: 'Thank you for your submission',
      copy: 'Your inquiry was sent successfully.',
    },
  },
}

function LeadForm({
  autoFocus = false,
  locale = 'es',
  onLocaleChange,
  onSuccessComplete,
}) {
  const [values, setValues] = useState(emptyValues)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const [isSuccessVisible, setIsSuccessVisible] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)
  const copy = formCopy[locale] ?? formCopy.es
  const liveErrors = validateLead(values, copy.validation)
  const isFormValid = Object.keys(liveErrors).length === 0

  const resetTurnstile = () => {
    setTurnstileToken('')
    setTurnstileKey((current) => current + 1)
  }

  useEffect(() => {
    if (!isSuccessVisible) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      if (onSuccessComplete) {
        onSuccessComplete()
        return
      }

      setIsSuccessVisible(false)
      setStatus({ type: 'idle', message: '' })
    }, SUCCESS_SCREEN_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isSuccessVisible, onSuccessComplete])

  const showSuccessState = (message) => {
    markSubmission()
    setFieldErrors({})
    setValues(emptyValues)
    setStatus({
      type: 'success',
      message,
    })
    setIsSuccessVisible(true)
  }

  const handleLocaleChange = (nextLocale) => {
    if (!onLocaleChange || nextLocale === locale) {
      return
    }

    const nextCopy = formCopy[nextLocale] ?? formCopy.es

    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors(validateLead(values, nextCopy.validation))
    }

    if (status.type !== 'idle') {
      setStatus({ type: 'idle', message: '' })
    }

    onLocaleChange(nextLocale)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValues = {
      ...values,
      [name]: value,
    }

    setValues(nextValues)

    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors(validateLead(nextValues, copy.validation))
    }

    setStatus((current) =>
      current.type === 'idle' ? current : { type: 'idle', message: '' },
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = liveErrors
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      setStatus({
        type: 'error',
        message: copy.status.requiredFields,
      })
      return
    }

    if (values.companyWebsite.trim()) {
      showSuccessState(copy.status.honeypotSuccess)
      resetTurnstile()
      return
    }

    if (shouldThrottleSubmission()) {
      setStatus({
        type: 'error',
        message: copy.status.throttle(
          Math.floor(MIN_SUBMIT_INTERVAL_MS / 1000),
        ),
      })
      return
    }

    if (!turnstileToken) {
      setStatus({
        type: 'error',
        message: copy.status.captchaRequired,
      })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      await submitLead(values, {
        turnstileToken,
        optimistic: true,
        onResult: (result) => {
          if (!result.ok) {
            console.error(
              'Lead submission failed after optimistic confirmation.',
              result.error,
            )
          }
        },
      })
      showSuccessState(copy.status.success)
    } catch (error) {
      const missingEndpoint = error.message.includes('VITE_FORM_ENDPOINT')
      const missingTurnstile = error.message.includes('VITE_TURNSTILE_SITE_KEY')
      const missingToken = error.message.includes('Turnstile token')
      setIsSuccessVisible(false)
      setStatus({
        type: 'error',
        message: missingEndpoint
          ? copy.status.missingEndpoint
          : missingTurnstile
            ? copy.status.missingTurnstile
            : missingToken
              ? copy.status.captchaRequired
              : copy.status.genericError,
      })
    } finally {
      setIsSubmitting(false)
      resetTurnstile()
    }
  }

  const inputClassName = (name) =>
    `field ${fieldErrors[name] ? 'field-error' : ''}`.trim()

  const requiredMark = (
    <span aria-hidden="true" className="contact-form__required">
      *
    </span>
  )

  if (isSuccessVisible) {
    return (
      <div
        className="contact-success"
        lang={locale}
        role="status"
        aria-live="polite"
      >
        <div className="contact-success__badge" aria-hidden="true">
          <img
            src="/check_mark.png"
            alt=""
            className="contact-success__icon"
          />
        </div>
        <div className="contact-success__content">
          <h2 id="contact-title" className="contact-success__title">
            {copy.successScreen.title}
          </h2>
          <p className="contact-success__copy">
            {copy.successScreen.copy}
          </p>
        </div>
      </div>
    )
  }

  return (
    <form
      id="contact"
      className="contact-form"
      onSubmit={handleSubmit}
      lang={locale}
      noValidate
    >
      <header className="contact-form__header">
        <div className="contact-form__toolbar">
          <p className="contact-form__eyebrow">{copy.eyebrow}</p>
          <div
            className="contact-form__language"
            role="group"
            aria-label={copy.languageLabel}
          >
            {Object.entries(copy.languages).map(([language, label]) => (
              <button
                key={language}
                type="button"
                className={`contact-form__language-button ${
                  locale === language ? 'is-active' : ''
                }`.trim()}
                onClick={() => handleLocaleChange(language)}
                aria-pressed={locale === language}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <h2 id="contact-title" className="contact-form__title">
          {copy.title}
        </h2>
        <p className="contact-form__copy">{copy.copy}</p>
      </header>

      <div className="contact-form__grid">
        <div className="contact-form__column">
          <label className="contact-form__label" htmlFor="name">
            {copy.labels.name}
            {requiredMark}
            <input
              id="name"
              name="name"
              type="text"
              autoFocus={autoFocus}
              autoComplete="name"
              required
              maxLength={MAX_NAME_LENGTH}
              value={values.name}
              onChange={handleChange}
              className={inputClassName('name')}
              placeholder={copy.placeholders.name}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            />
            {fieldErrors.name ? (
              <span id="name-error" className="mt-2 block text-sm text-clay">
                {fieldErrors.name}
              </span>
            ) : null}
          </label>

          <fieldset className="contact-form__split">
            <label className="contact-form__label" htmlFor="email">
              {copy.labels.email}
              {requiredMark}
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={MAX_EMAIL_LENGTH}
                value={values.email}
                onChange={handleChange}
                className={inputClassName('email')}
                placeholder={copy.placeholders.email}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email ? (
                <span id="email-error" className="mt-2 block text-sm text-clay">
                  {fieldErrors.email}
                </span>
              ) : null}
            </label>

            <label className="contact-form__label" htmlFor="phone">
              {copy.labels.phone}
              {requiredMark}
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                maxLength={MAX_PHONE_LENGTH}
                value={values.phone}
                onChange={handleChange}
                className={inputClassName('phone')}
                placeholder={copy.placeholders.phone}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
              />
              {fieldErrors.phone ? (
                <span id="phone-error" className="mt-2 block text-sm text-clay">
                  {fieldErrors.phone}
                </span>
              ) : null}
            </label>
          </fieldset>

          <label className="visually-hidden" htmlFor="companyWebsite">
            {copy.labels.honeypot}
            <input
              id="companyWebsite"
              name="companyWebsite"
              type="text"
              tabIndex="-1"
              autoComplete="off"
              value={values.companyWebsite}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="contact-form__column">
          <label className="contact-form__label" htmlFor="message">
            {copy.labels.message}
            {requiredMark}
            <textarea
              id="message"
              name="message"
              rows="4"
              required
              maxLength={MAX_MESSAGE_LENGTH}
              value={values.message}
              onChange={handleChange}
              className={`${inputClassName('message')} contact-form__textarea`.trim()}
              placeholder={copy.placeholders.message}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? 'message-error' : undefined}
            />
            {fieldErrors.message ? (
              <span id="message-error" className="mt-2 block text-sm text-clay">
                {fieldErrors.message}
              </span>
            ) : null}
            <span className="contact-form__count">
              {values.message.length}/{MAX_MESSAGE_LENGTH}
            </span>
          </label>

          <div
            className="contact-form__captcha"
            aria-label={copy.labels.securityCheck}
          >
            <TurnstileWidget
              key={`${locale}-${turnstileKey}`}
              locale={locale}
              onTokenChange={(token) => {
                setTurnstileToken(token)

                if (!token) {
                  return
                }

                setStatus((current) =>
                  current.type === 'error'
                    ? { type: 'idle', message: '' }
                    : current,
                )
              }}
              onExpire={() => {
                setTurnstileToken('')
                setStatus({
                  type: 'error',
                  message: copy.status.captchaExpired,
                })
              }}
              onError={(error) => {
                setTurnstileToken('')
                setStatus({
                  type: 'error',
                  message: error.message.includes('VITE_TURNSTILE_SITE_KEY')
                    ? copy.status.missingTurnstile
                    : copy.status.captchaLoadError,
                  })
              }}
            />
          </div>
        </div>
      </div>

      <footer className="contact-form__footer">
        <p aria-live="polite" className="contact-form__status">
          {status.message ? (
            <span className={status.type === 'error' ? 'text-clay' : 'text-moss'}>
              {status.message}
            </span>
          ) : null}
        </p>

        <button
          type="submit"
          className="button-primary contact-form__button disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-black/8 disabled:hover:text-black"
          disabled={isSubmitting || !isFormValid || !turnstileToken}
        >
          {isSubmitting ? copy.submit.pending : copy.submit.idle}
        </button>
      </footer>
    </form>
  )
}

export default LeadForm
