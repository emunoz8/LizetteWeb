const LAST_SUBMISSION_KEY = 'lead-form:last-submitted-at'

export const MIN_SUBMIT_INTERVAL_MS = 30_000
export const MAX_NAME_LENGTH = 30
export const MAX_EMAIL_LENGTH = 60
export const MAX_PHONE_LENGTH = 20
export const MAX_MESSAGE_LENGTH = 140
export const TURNSTILE_ACTION = 'lead_form'

const SUBMISSION_TIMEOUT_MS = 20_000
const OPTIMISTIC_RESOLVE_DELAY_MS = 150
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\+?[0-9().\-\s]{10,20}$/

const trimValue = (value) => value.trim()

const hiddenFrameStyle = `
  position:absolute;
  width:0;
  height:0;
  border:0;
  clip:rect(0 0 0 0);
  clip-path:inset(50%);
  overflow:hidden;
`.trim()

const defaultValidationMessages = {
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
}

export function validateLead(values, messages = defaultValidationMessages) {
  const errors = {}
  const nameValue = trimValue(values.name)
  const emailValue = trimValue(values.email)
  const phoneValue = trimValue(values.phone)
  const messageValue = trimValue(values.message)
  const phoneDigits = phoneValue.replace(/\D/g, '')

  if (!nameValue) {
    errors.name = messages.nameRequired
  } else if (nameValue.length > MAX_NAME_LENGTH) {
    errors.name = messages.nameTooLong
  }

  if (!emailValue) {
    errors.email = messages.emailRequired
  } else if (emailValue.length > MAX_EMAIL_LENGTH) {
    errors.email = messages.emailTooLong
  } else if (!emailPattern.test(emailValue)) {
    errors.email = messages.emailInvalid
  }

  if (!phoneValue) {
    errors.phone = messages.phoneRequired
  } else if (phoneValue.length > MAX_PHONE_LENGTH) {
    errors.phone = messages.phoneTooLong
  } else if (
    !phonePattern.test(phoneValue) ||
    phoneDigits.length < 10 ||
    phoneDigits.length > 15
  ) {
    errors.phone = messages.phoneInvalid
  }

  if (!messageValue) {
    errors.message = messages.messageRequired
  } else if (messageValue.length > MAX_MESSAGE_LENGTH) {
    errors.message = messages.messageTooLong
  }

  return errors
}

export function shouldThrottleSubmission(now = Date.now()) {
  if (typeof window === 'undefined') {
    return false
  }

  const lastSubmittedAt = Number(
    window.localStorage.getItem(LAST_SUBMISSION_KEY) ?? 0,
  )

  return Number.isFinite(lastSubmittedAt)
    ? now - lastSubmittedAt < MIN_SUBMIT_INTERVAL_MS
    : false
}

export function markSubmission(now = Date.now()) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(LAST_SUBMISSION_KEY, String(now))
}

function createSubmissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeSubmissionMessage(data) {
  if (!data) {
    return null
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  return typeof data === 'object' ? data : null
}

function submitLeadThroughIframe(endpoint, payload, options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('Lead submission is only available in the browser.'),
    )
  }

  return new Promise((resolve, reject) => {
    const { optimistic = false, onResult } = options
    const submissionId = payload.submissionId
    const frameName = `lead-submit-${submissionId}`
    const iframe = document.createElement('iframe')
    const form = document.createElement('form')
    let hasSettled = false
    let hasResolvedOptimistically = false

    iframe.name = frameName
    iframe.title = 'Lead submission response'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.tabIndex = -1
    iframe.style.cssText = hiddenFrameStyle

    form.method = 'POST'
    form.action = endpoint
    form.target = frameName
    form.style.display = 'none'

    Object.entries(payload).forEach(([name, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    })

    let timeoutId

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      window.clearTimeout(timeoutId)
      iframe.remove()
      form.remove()
    }

    const settle = (result) => {
      if (hasSettled) {
        return
      }

      hasSettled = true
      cleanup()
      onResult?.(result)

      if (optimistic && hasResolvedOptimistically) {
        return
      }

      if (result.ok) {
        resolve()
        return
      }

      reject(new Error(result.error || 'Lead submission failed.'))
    }

    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) {
        return
      }

      const response = normalizeSubmissionMessage(event.data)

      if (
        !response ||
        response.type !== 'lead-form-response' ||
        (response.submissionId && response.submissionId !== submissionId)
      ) {
        return
      }

      settle({
        ok: Boolean(response.ok),
        error: response.error || 'Lead submission failed.',
      })
    }

    timeoutId = window.setTimeout(() => {
      settle({
        ok: false,
        error: 'Lead submission timed out.',
      })
    }, SUBMISSION_TIMEOUT_MS)

    window.addEventListener('message', handleMessage)
    document.body.appendChild(iframe)
    document.body.appendChild(form)
    form.submit()

    if (optimistic) {
      window.setTimeout(() => {
        if (hasSettled || hasResolvedOptimistically) {
          return
        }

        hasResolvedOptimistically = true
        resolve()
      }, OPTIMISTIC_RESOLVE_DELAY_MS)
    }
  })
}

export async function submitLead(values, options = {}) {
  const endpoint = import.meta.env.VITE_FORM_ENDPOINT?.trim()
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()
  const turnstileToken = options.turnstileToken?.trim()
  const optimistic = options.optimistic ?? true

  if (!endpoint) {
    throw new Error('Missing VITE_FORM_ENDPOINT configuration.')
  }

  if (!turnstileSiteKey) {
    throw new Error('Missing VITE_TURNSTILE_SITE_KEY configuration.')
  }

  if (!turnstileToken) {
    throw new Error('Missing Turnstile token.')
  }

  const payload = {
    name: trimValue(values.name),
    email: trimValue(values.email),
    phone: trimValue(values.phone),
    message: trimValue(values.message),
    companyWebsite: trimValue(values.companyWebsite),
    parentOrigin:
      typeof window === 'undefined' ? '' : window.location.origin,
    pageOrigin:
      typeof window === 'undefined' ? '' : window.location.origin,
    pagePath:
      typeof window === 'undefined'
        ? ''
        : window.location.pathname + window.location.search,
    submissionId: createSubmissionId(),
    submittedAt: new Date().toISOString(),
    source: import.meta.env.VITE_LEAD_SOURCE?.trim() || 'website',
    turnstileToken,
  }

  await submitLeadThroughIframe(endpoint, payload, {
    optimistic,
    onResult: options.onResult,
  })
}
