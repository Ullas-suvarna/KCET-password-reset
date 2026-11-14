/**
 * api/send-reset-email.js
 *
 * Vercel Serverless Function — POST /api/send-reset-email
 *
 * Accepts a student email address, applies persistent rate limiting,
 * reads the email provider configuration from Firestore, and either:
 *   (a) generates a genuine Firebase password-reset link and sends a
 *       custom email via the EmailJS REST API, or
 *   (b) returns { fallbackToFirebase: true } so the Android app can
 *       call sendPasswordResetEmail() directly.
 *
 * SECURITY GUARANTEES
 * - Only POST is accepted.
 * - oobCode and reset_link are NEVER returned in any API response.
 * - Emails are NEVER logged.
 * - Rate-limit identifiers are HMAC-SHA256 digests of the email — no
 *   plaintext email is stored in Firestore.
 * - Generic responses prevent account enumeration.
 * - Cache-Control: no-store is set on every response.
 * - sendPasswordResetEmail() is NEVER called from this backend.
 */

import crypto from 'crypto';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

// ─── Constants ─────────────────────────────────────────────────────────────

const APP_URL =
  process.env.PUBLIC_APP_URL || 'https://kcet-password-reset.vercel.app';

const CONFIG_COLLECTION    = 'app_config';
const CONFIG_DOC           = 'email_delivery';
const RATE_LIMITS_COLLECTION = 'rate_limits';
const MAX_REQUESTS_PER_HOUR = 3;
const HOUR_MS               = 60 * 60 * 1000;
const EMAILJS_TIMEOUT_MS    = 15_000; // 15 s — if exceeded, delivery is uncertain

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Basic RFC 5322-flavoured email validation. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * HMAC-SHA256 of the normalised email, keyed with RATE_LIMIT_SECRET.
 * Used as a Firestore document ID — the plaintext email is never stored.
 */
function hashEmail(email) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret) {
    throw new Error('RATE_LIMIT_SECRET environment variable is not set.');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(email.toLowerCase().trim())
    .digest('hex');
}

/**
 * Atomically checks and increments the rate-limit counter for an email hash.
 * Returns true if the request is within the limit, false if it should be blocked.
 *
 * Uses a Firestore transaction to prevent race conditions.
 * Timestamps older than 1 hour are discarded on every write.
 */
async function checkAndIncrementRateLimit(db, emailHash) {
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(emailHash);
  const now = Date.now();
  const windowStart = now - HOUR_MS;

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);

    // Filter: keep only timestamps within the current 1-hour window.
    const recentTimestamps = doc.exists
      ? (doc.data().requests || []).filter((ts) => ts > windowStart)
      : [];

    if (recentTimestamps.length >= MAX_REQUESTS_PER_HOUR) {
      return false; // Rate limited — do not increment
    }

    recentTimestamps.push(now);
    // Store the cleaned-up array (old timestamps already removed).
    transaction.set(ref, { requests: recentTimestamps });
    return true;
  });
}

/**
 * Reads the email delivery configuration from Firestore.
 * If the document does not exist it is initialised with
 * customEmailEnabled = false (EmailJS disabled until an admin enables it).
 */
async function getEmailConfig(db) {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
  const doc = await ref.get();

  if (!doc.exists) {
    // First-run default: EmailJS is OFF until administrator verifies credentials
    // and explicitly enables it via /api/admin/email-settings.
    const defaults = {
      activeProvider:    'firebase',
      customEmailEnabled: false,
      lastFailureReason: '',
      updatedAt:         FieldValue.serverTimestamp(),
    };
    await ref.set(defaults);
    return { activeProvider: 'firebase', customEmailEnabled: false };
  }

  const data = doc.data();
  return {
    activeProvider:     data.activeProvider    || 'firebase',
    customEmailEnabled: data.customEmailEnabled === true,
  };
}

/**
 * Permanently disables EmailJS in Firestore after a confirmed quota exhaustion.
 * Only called when EmailJS explicitly reports that the monthly quota is exhausted.
 * Never called for temporary errors or uncertain deliveries.
 */
async function disableEmailJsDueToQuota(db) {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
  await ref.set(
    {
      activeProvider:     'firebase',
      customEmailEnabled: false,
      lastFailureReason:  'EMAILJS_QUOTA_EXCEEDED',
      updatedAt:          FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── Vercel Handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Security headers on every response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // ── 1. Method guard ──────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed.' });
  }

  // ── 2. Email validation ──────────────────────────────────────────────────
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email address is required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  try {
    const db = getAdminFirestore();

    // ── 3. Rate limiting ───────────────────────────────────────────────────
    let emailHash;
    try {
      emailHash = hashEmail(normalizedEmail);
    } catch {
      // RATE_LIMIT_SECRET is missing — fail safely
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const withinLimit = await checkAndIncrementRateLimit(db, emailHash);
    if (!withinLimit) {
      // Return a generic "success-looking" response to prevent enumeration.
      // The Android app will display the same message regardless of rate limiting.
      return res.status(200).json({
        success: true,
        message:
          'If this email is registered, a password reset link has been sent.',
      });
    }

    // ── 4. Read provider configuration ────────────────────────────────────
    const config = await getEmailConfig(db);

    if (!config.customEmailEnabled) {
      // EmailJS is disabled — instruct Android to call sendPasswordResetEmail()
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // ── 5. Verify EmailJS environment variables are present ───────────────
    const emailjsServiceId   = process.env.EMAILJS_SERVICE_ID;
    const emailjsTemplateId  = process.env.EMAILJS_TEMPLATE_ID;
    const emailjsPublicKey   = process.env.EMAILJS_PUBLIC_KEY;
    const emailjsPrivateKey  = process.env.EMAILJS_PRIVATE_KEY;

    if (
      !emailjsServiceId  ||
      !emailjsTemplateId ||
      !emailjsPublicKey  ||
      !emailjsPrivateKey
    ) {
      // EmailJS credentials not fully configured — fallback, do not disable permanently
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // ── 6. Generate genuine Firebase password-reset link ──────────────────
    const auth = await getAdminAuth();
    let firebaseResetLink;

    try {
      firebaseResetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (firebaseErr) {
      const code = firebaseErr.code || '';

      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        // Generic response — do not reveal whether the email is registered.
        return res.status(200).json({
          success: true,
          message:
            'If this email is registered, a password reset link has been sent.',
        });
      }
      // Other Firebase Admin errors — safe to fallback
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // ── 7. Extract the real oobCode from the Firebase-generated URL ───────
    let oobCode;
    try {
      const parsed = new URL(firebaseResetLink);
      oobCode = parsed.searchParams.get('oobCode');
    } catch {
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    if (!oobCode) {
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // ── 8. Build the custom Vercel reset URL ──────────────────────────────
    // This URL is sent in the email body only. It is NEVER returned to the
    // Android app or included in any API response.
    const resetLink = `${APP_URL}/reset-password?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;

    // ── 9. Send email via EmailJS REST API ────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMAILJS_TIMEOUT_MS);

    let emailjsResponse;
    let responseText = '';

    try {
      emailjsResponse = await fetch(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id:  emailjsServiceId,
            template_id: emailjsTemplateId,
            user_id:     emailjsPublicKey,
            accessToken: emailjsPrivateKey,
            template_params: {
              to_email:   normalizedEmail,
              reset_link: resetLink, // goes into the email body only
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      responseText = await emailjsResponse.text();
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr.name === 'AbortError') {
        // The request timed out AFTER it may have been accepted by EmailJS.
        // Returning Firebase fallback here risks a duplicate email.
        // Return a distinct "uncertain" response so the Android app can
        // display "please wait a few minutes" without re-sending immediately.
        return res.status(200).json({
          success:         false,
          deliveryUncertain: true,
          message:
            'Email delivery status is uncertain. ' +
            'Please wait a few minutes before requesting another link.',
        });
      }

      // Network-level error — the request almost certainly never reached EmailJS.
      // Safe to instruct Android to use Firebase fallback.
      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // ── 10. Evaluate EmailJS response ─────────────────────────────────────

    // Success: EmailJS accepted the request (HTTP 200 / body "OK")
    if (emailjsResponse.ok) {
      // oobCode and resetLink are INTENTIONALLY omitted from this response.
      return res.status(200).json({
        success:  true,
        provider: 'emailjs',
        message:
          'If this email is registered, a password reset link has been sent.',
      });
    }

    // Quota exhaustion: only flag as permanent if EmailJS explicitly confirms it.
    // Check both the HTTP status and the response body before permanently
    // disabling EmailJS — do not misclassify every error as quota exhaustion.
    const bodyLower = responseText.toLowerCase();
    const isQuotaExhausted =
      (emailjsResponse.status === 429 ||
        (emailjsResponse.status === 400 &&
          (bodyLower.includes('limit has been reached') ||
            bodyLower.includes('monthly') ||
            bodyLower.includes('daily') ||
            bodyLower.includes('quota'))));

    if (isQuotaExhausted) {
      // Permanently disable EmailJS — only the admin can re-enable it.
      await disableEmailJsDueToQuota(db);

      return res.status(200).json({
        success:           false,
        fallbackToFirebase: true,
        provider:          'firebase',
        message:           'Please use the default password reset service.',
      });
    }

    // Any other EmailJS error (temporary / auth / server error):
    // Do NOT update Firestore — EmailJS remains active for future requests.
    // Return fallback for this individual request only.
    return res.status(200).json({
      success:           false,
      fallbackToFirebase: true,
      provider:          'firebase',
      message:           'Please use the default password reset service.',
    });
  } catch (unexpectedErr) {
    // Last-resort catch — prevents 500 stack traces leaking to clients
    return res.status(200).json({
      success:           false,
      fallbackToFirebase: true,
      provider:          'firebase',
      message:           'Please use the default password reset service.',
    });
  }
}
