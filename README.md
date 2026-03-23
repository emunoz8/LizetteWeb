# Lizette Studio Lead Capture Site

Single-page React + Tailwind site for collecting leads and writing them into
Google Sheets through Google Apps Script. The frontend is static-host friendly
and ready to deploy on Vercel.

## Project summary

This site was created as a clean, bilingual lead capture experience for
Lizette Malagon and Duarte Realty Co. The goal was to keep the design elegant,
minimal, and image-driven while making it easy for visitors to reach out from
either desktop or mobile.

The process focused on refining the visual hierarchy, simplifying the layout,
and building a lightweight contact flow without a traditional backend. The site
was built in React with Tailwind CSS, with the inquiry form connected to Google
Sheets through Google Apps Script. Spanish and English support, validation,
spam protection, and responsive behavior were all included so the final result
feels polished while staying easy to maintain.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and add your Apps Script deployment URL
   plus your Cloudflare Turnstile site key:

   ```bash
   cp .env.example .env.local
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

## Environment variables

- `VITE_FORM_ENDPOINT`: Google Apps Script web app URL.
- `VITE_TURNSTILE_SITE_KEY`: Public Cloudflare Turnstile site key.
- `VITE_LEAD_SOURCE`: Optional label stored in Sheets with each submission.

## Google Sheets setup

1. Create the spreadsheet you want to use for incoming leads.
2. In that spreadsheet, open `Extensions > Apps Script`.
3. Replace the default script contents with `google-apps-script/Code.gs`.
4. Open `Project Settings > Script properties` and add:
   - `TURNSTILE_SECRET_KEY`: your private Cloudflare Turnstile secret key
5. Save and deploy the script as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the deployed `/exec` URL into `VITE_FORM_ENDPOINT`.
7. Submit the form once to create the `Leads` tab and header row automatically.

## Cloudflare Turnstile setup

1. Create a Turnstile widget in Cloudflare.
2. Add the domains that will host this site, currently `soldbylizette.com` and `www.soldbylizette.com`.
3. Copy the site key into `VITE_TURNSTILE_SITE_KEY`.
4. Copy the secret key into the Apps Script property `TURNSTILE_SECRET_KEY`.
5. If the domain changes, update the `TURNSTILE_ALLOWED_HOSTNAMES` constant in `google-apps-script/Code.gs` before redeploying the script.

## Important integration note

The frontend posts to Apps Script through a hidden iframe and waits for a
`postMessage` response from the deployed web app. This keeps the site static
while still letting the UI distinguish between accepted and rejected
submissions. Apps Script verifies the Turnstile token server-side before
writing to the sheet, and also applies basic rate limiting plus duplicate
rejection.

## Deployment

Deploy the project as a static frontend on Vercel:

1. Import the repo into Vercel.
2. Add `VITE_FORM_ENDPOINT`, `VITE_TURNSTILE_SITE_KEY`, and optionally
   `VITE_LEAD_SOURCE`.
3. Deploy.

## Included behavior

- One-page landing page with hero, explanation, and contact form.
- Client-side validation for name, email, phone, and message.
- Hidden honeypot field, local submit throttling, and Cloudflare Turnstile.
- Inline success and error messaging.
- Google Apps Script endpoint that verifies Turnstile before appending rows to Sheets.
