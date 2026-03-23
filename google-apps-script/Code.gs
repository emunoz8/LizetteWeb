const SHEET_NAME = 'Leads'
const HEADERS = ['Timestamp', 'Name', 'Email', 'Phone', 'Message', 'Source']

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'lead_form'
const TURNSTILE_ALLOWED_HOSTNAMES = [
  'soldbylizette.com',
  'www.soldbylizette.com',
]

const MAX_NAME_LENGTH = 30
const MAX_EMAIL_LENGTH = 60
const MAX_PHONE_LENGTH = 20
const MAX_MESSAGE_LENGTH = 140

const GLOBAL_RATE_LIMIT_WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_WINDOW = 20
const DUPLICATE_WINDOW_SECONDS = 600

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9().\-\s]{10,20}$/

function doGet() {
  return respond_({
    ok: true,
    message: 'Lead capture endpoint is running.',
  })
}

function doPost(e) {
  let payload = {}
  let responsePayload

  try {
    payload = parsePayload_(e)
    validatePayload_(payload)
    verifyTurnstile_(payload.turnstileToken)
    enforceGlobalRateLimit_()
    appendLead_(payload)

    responsePayload = {
      ok: true,
      submissionId: normalizeValue_(payload.submissionId),
      type: 'lead-form-response',
    }
  } catch (error) {
    console.warn('Lead submission rejected: ' + error.message)

    responsePayload = {
      ok: false,
      error: error.message,
      submissionId: normalizeValue_(payload.submissionId),
      type: 'lead-form-response',
    }
  }

  return respondToParent_(responsePayload, payload.parentOrigin)
}

function parsePayload_(e) {
  if (!e) {
    throw new Error('Missing request body.')
  }

  if (e.parameter && Object.keys(e.parameter).length > 0) {
    return e.parameter
  }

  if (!e.postData || !e.postData.contents) {
    throw new Error('Missing request body.')
  }

  const payload = JSON.parse(e.postData.contents)

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload.')
  }

  return payload
}

function validatePayload_(payload) {
  const name = normalizeValue_(payload.name)
  const email = normalizeValue_(payload.email)
  const phone = normalizeValue_(payload.phone)
  const message = normalizeValue_(payload.message)
  const honeypot = normalizeValue_(payload.companyWebsite)
  const turnstileToken = normalizeValue_(payload.turnstileToken)
  const phoneDigits = phone.replace(/\D/g, '')

  if (honeypot) {
    throw new Error('Spam check failed.')
  }

  if (!turnstileToken) {
    throw new Error('Turnstile token is required.')
  }

  if (!name) {
    throw new Error('Name is required.')
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new Error('Name is too long.')
  }

  if (!email) {
    throw new Error('Email is required.')
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    throw new Error('Email is too long.')
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Email is invalid.')
  }

  if (!phone) {
    throw new Error('Phone is required.')
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    throw new Error('Phone is too long.')
  }

  if (
    !PHONE_PATTERN.test(phone) ||
    phoneDigits.length < 10 ||
    phoneDigits.length > 15
  ) {
    throw new Error('Phone is invalid.')
  }

  if (!message) {
    throw new Error('Message is required.')
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error('Message is too long.')
  }
}

function enforceGlobalRateLimit_() {
  const cache = CacheService.getScriptCache()
  const bucket = Math.floor(
    Date.now() / (GLOBAL_RATE_LIMIT_WINDOW_SECONDS * 1000),
  )
  const key = 'lead-rate:' + bucket
  const lock = LockService.getScriptLock()

  lock.waitLock(5000)

  try {
    const currentCount = Number(cache.get(key) || 0)
    const nextCount = Number.isFinite(currentCount) ? currentCount + 1 : 1
    cache.put(key, String(nextCount), GLOBAL_RATE_LIMIT_WINDOW_SECONDS + 5)

    if (nextCount > MAX_REQUESTS_PER_WINDOW) {
      throw new Error('Too many submissions. Please try again shortly.')
    }
  } finally {
    lock.releaseLock()
  }
}

function verifyTurnstile_(token) {
  const secretKey = getRequiredProperty_('TURNSTILE_SECRET_KEY')
  const allowedHostnames = getAllowedHostnames_()
  const response = UrlFetchApp.fetch(TURNSTILE_VERIFY_URL, {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      secret: secretKey,
      response: token,
      idempotency_key: Utilities.getUuid(),
    },
  })

  if (response.getResponseCode() !== 200) {
    throw new Error('Security verification failed.')
  }

  const verification = JSON.parse(response.getContentText())

  if (!verification.success) {
    throw new Error('Security verification failed.')
  }

  if (verification.action && verification.action !== TURNSTILE_ACTION) {
    throw new Error('Security verification action mismatch.')
  }

  if (allowedHostnames.length > 0) {
    const hostname = normalizeValue_(verification.hostname).toLowerCase()

    if (!allowedHostnames.includes(hostname)) {
      throw new Error('Security verification hostname mismatch.')
    }
  }
}

function appendLead_(payload) {
  const cache = CacheService.getScriptCache()
  const fingerprint = buildSubmissionFingerprint_(payload)
  const lock = LockService.getScriptLock()

  lock.waitLock(5000)

  try {
    if (cache.get(fingerprint)) {
      throw new Error('Duplicate submission detected.')
    }

    const sheet = getSheet_()
    sheet.appendRow([
      parseSubmittedAt_(payload.submittedAt),
      payload.name.trim(),
      payload.email.trim(),
      payload.phone.trim(),
      payload.message.trim(),
      payload.source ? payload.source.trim() : 'website',
    ])

    cache.put(fingerprint, '1', DUPLICATE_WINDOW_SECONDS)
  } finally {
    lock.releaseLock()
  }
}

function buildSubmissionFingerprint_(payload) {
  const fingerprintSource = [
    normalizeValue_(payload.email).toLowerCase(),
    normalizeValue_(payload.phone),
    normalizeValue_(payload.message).toLowerCase(),
  ].join('|')

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    fingerprintSource,
  )

  return (
    'lead-fingerprint:' + Utilities.base64EncodeWebSafe(digest).slice(0, 32)
  )
}

function parseSubmittedAt_(value) {
  if (!value) {
    return new Date()
  }

  const parsedDate = new Date(value)

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
}

function getAllowedHostnames_() {
  return TURNSTILE_ALLOWED_HOSTNAMES.map((value) =>
    normalizeValue_(value).toLowerCase(),
  ).filter(Boolean)
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name)

  if (!value) {
    throw new Error('Missing script property: ' + name)
  }

  return value.trim()
}

function respondToParent_(payload, parentOrigin) {
  const serializedPayload = serializeForInlineScript_(payload)
  const serializedOrigin = serializeForInlineScript_(
    normalizeOrigin_(parentOrigin),
  )
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lead Submission</title>
  </head>
  <body>
    <script>
      const message = ${serializedPayload};
      const targetOrigin = ${serializedOrigin};

      if (window.top && window.top !== window) {
        window.top.postMessage(message, targetOrigin);
      }
    </script>
  </body>
</html>`

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(
    HtmlService.XFrameOptionsMode.ALLOWALL,
  )
}

function normalizeValue_(value) {
  return String(value || '').trim()
}

function normalizeOrigin_(value) {
  const origin = normalizeValue_(value)

  if (!origin) {
    return '*'
  }

  return /^https?:\/\/[^/]+$/i.test(origin) ? origin : '*'
}

function serializeForInlineScript_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = spreadsheet.getSheetByName(SHEET_NAME)

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME)
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    sheet.setFrozenRows(1)
  }

  return sheet
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
