/**
 * api/send-verification-email.js
 *
 * Vercel Serverless Function — POST /api/send-verification-email
 *
 * Accepts a student's Firebase ID token via Authorization: Bearer <token>,
 * verifies identity and registration status with the Firebase Admin SDK,
 * enforces dedicated rate limiting, reads provider configuration from Firestore,
 * and either:
 *   (a) generates a genuine Firebase email-verification link and sends a
 *       custom branded email via the EmailJS REST API, or
 *   (b) returns { fallbackToFirebase: true } so the client can call
 *       user.sendEmailVerification() directly, or
 *   (c) returns { success: true, alreadyVerified: true } if the account
 *       is already email verified.
 *
 * SECURITY & PRIVACY
 * - User UID and email are derived strictly from the verified Firebase ID token.
 * - Client-supplied emails in request bodies are NEVER trusted.
 * - Rate-limit identifiers are HMAC-SHA256 digests — no plaintext email stored.
 * - oobCode and verification_link are NEVER returned to the client.
 * - Secrets remain server-side only in environment variables.
 */

import crypto from 'crypto';
import * as jose from 'jose';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const APP_URL =
  process.env.PUBLIC_APP_URL || 'https://kcet-password-reset.vercel.app';

const PROJECT_ID                   = process.env.VITE_FIREBASE_PROJECT_ID || 'kcet-app-c0457';
const CONFIG_COLLECTION            = 'app_config';
const CONFIG_DOC                   = 'email_delivery';
const RATE_LIMITS_COLLECTION       = 'rate_limits_verification';
const MAX_VERIFICATIONS_PER_HOUR   = 5;
const HOUR_MS                      = 60 * 60 * 1000;
const EMAILJS_TIMEOUT_MS           = 15_000; // 15 s timeout

const GOOGLE_JWKS = jose.createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Verifies the incoming Bearer token using Google's public JWKS.
 * Returns the decoded token payload { uid, email, ... }.
 */
async function authenticateUser(req) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authorisation required.' };
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw { status: 401, message: 'Authorisation required.' };
  }

  try {
    const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    return payload;
  } catch (err) {
    console.error('[send-verification-email] Token verification failed:', err.message);
    throw { status: 401, message: 'Invalid or expired session. Please sign in again.' };
  }
}

/**
 * HMAC-SHA256 of the normalised email, keyed with RATE_LIMIT_SECRET.
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
 * Atomically checks and increments verification rate-limit counter in Firestore.
 */
async function checkAndIncrementRateLimit(db, emailHash) {
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(emailHash);
  const now = Date.now();
  const windowStart = now - HOUR_MS;

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);

    const recentTimestamps = doc.exists
      ? (doc.data().requests || []).filter((ts) => ts > windowStart)
      : [];

    if (recentTimestamps.length >= MAX_VERIFICATIONS_PER_HOUR) {
      return false; // Rate limited
    }

    recentTimestamps.push(now);
    transaction.set(ref, { requests: recentTimestamps });
    return true;
  });
}

// ─── Vercel Handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Security & Cache-Control headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed.' });
  }

  try {
    // ── 1. Authenticate user from Firebase ID token ────────────────────────
    let tokenPayload;
    try {
      tokenPayload = await authenticateUser(req);
    } catch (authErr) {
      return res.status(authErr.status || 401).json({ error: authErr.message });
    }

    const uid = tokenPayload.sub || tokenPayload.user_id;
    if (!uid) {
      return res.status(401).json({ error: 'Invalid token: UID missing.' });
    }

    // ── 2. Retrieve Firebase user record via Admin SDK ─────────────────────
    const auth = await getAdminAuth();
    let userRecord;
    try {
      userRecord = await auth.getUser(uid);
    } catch (userErr) {
      console.error('[send-verification-email] getUser error:', userErr.message);
      return res.status(404).json({ error: 'User account not found.' });
    }

    const userEmail = (userRecord.email || '').trim().toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ error: 'User account has no associated email address.' });
    }

    // ── 3. Check if already email verified ─────────────────────────────────
    if (userRecord.emailVerified === true) {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: 'Your email address is already verified.',
      });
    }

    const db = getAdminFirestore();

    // ── 4. Rate limiting ───────────────────────────────────────────────────
    let emailHash;
    try {
      emailHash = hashEmail(userEmail);
    } catch {
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const withinLimit = await checkAndIncrementRateLimit(db, emailHash);
    if (!withinLimit) {
      // Return success-looking message so attackers cannot probe rate limits
      return res.status(200).json({
        success: true,
        message: 'A verification link has been sent if eligible.',
      });
    }

    // ── 5. Check Firestore configuration (app_config/email_delivery) ───────
    const configDoc = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
    const configData = configDoc.exists ? configDoc.data() : {};
    const isCustomVerificationEnabled = configData.customVerificationEmailEnabled === true;

    if (!isCustomVerificationEnabled) {
      // Custom verification is disabled — instruct client to fallback to Firebase default
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'Custom verification email is currently disabled.',
      });
    }

    // ── 6. Check EmailJS environment variables ────────────────────────────
    const emailjsServiceId   = process.env.EMAILJS_SERVICE_ID;
    const emailjsTemplateId  = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID;
    const emailjsPublicKey   = process.env.EMAILJS_PUBLIC_KEY;
    const emailjsPrivateKey  = process.env.EMAILJS_PRIVATE_KEY;

    if (
      !emailjsServiceId  ||
      !emailjsTemplateId ||
      !emailjsPublicKey  ||
      !emailjsPrivateKey
    ) {
      console.warn('[send-verification-email] EmailJS verification template/keys missing, falling back to Firebase.');
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'EmailJS verification template is not configured.',
      });
    }

    // ── 7. Generate genuine Firebase email verification link ──────────────
    let firebaseLink;
    try {
      firebaseLink = await auth.generateEmailVerificationLink(userEmail);
    } catch (linkErr) {
      console.error('[send-verification-email] generateEmailVerificationLink error:', linkErr.message);
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'Failed to generate verification link from Firebase.',
      });
    }

    // ── 8. Extract genuine oobCode ─────────────────────────────────────────
    let oobCode;
    try {
      const parsed = new URL(firebaseLink);
      oobCode = parsed.searchParams.get('oobCode');
    } catch {
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'Unable to parse verification code.',
      });
    }

    if (!oobCode) {
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'Missing verification code in Firebase link.',
      });
    }

    // ── 9. Construct custom verification URL ───────────────────────────────
    const verificationLink = `${APP_URL}/verify-email?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;

    // ── 10. Dispatch custom email via EmailJS REST API ────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMAILJS_TIMEOUT_MS);

    let emailjsResponse;
    let responseText = '';

    try {
      emailjsResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  emailjsServiceId,
          template_id: emailjsTemplateId,
          user_id:     emailjsPublicKey,
          accessToken: emailjsPrivateKey,
          template_params: {
            to_email:          userEmail,
            verification_link: verificationLink,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      responseText = await emailjsResponse.text();
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr.name === 'AbortError') {
        // Delivery is uncertain — do NOT trigger Firebase fallback to prevent duplicate emails
        return res.status(200).json({
          deliveryUncertain: true,
          message: 'Email delivery status is uncertain. Please wait a few minutes.',
        });
      }

      console.error('[send-verification-email] Network error reaching EmailJS:', fetchErr.message);
      return res.status(200).json({
        fallbackToFirebase: true,
        message: 'Could not contact EmailJS service.',
      });
    }

    // ── 11. Handle EmailJS response ────────────────────────────────────────
    if (emailjsResponse.ok) {
      return res.status(200).json({
        success:  true,
        provider: 'emailjs',
        message:  'Verification email sent successfully via EmailJS.',
      });
    }

    console.error('[send-verification-email] EmailJS error:', emailjsResponse.status, responseText);
    return res.status(200).json({
      fallbackToFirebase: true,
      message: 'EmailJS rejected delivery.',
    });

  } catch (fatal) {
    console.error('[send-verification-email FATAL]:', fatal);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
