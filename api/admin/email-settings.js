/**
 * api/admin/email-settings.js
 *
 * Vercel Serverless Function
 *   GET  /api/admin/email-settings  — read current provider configuration
 *   POST /api/admin/email-settings  — update provider configuration
 *
 * AUTHENTICATION (every request)
 * ─────────────────────────────
 * 1. Caller must include:  Authorization: Bearer <Firebase ID Token>
 * 2. Firebase Admin SDK verifies the token signature and expiry.
 * 3. The decoded token's email_verified field must be true.
 * 4. The decoded token's email must match an address in the
 *    ADMIN_EMAILS environment variable (case-insensitive, comma-separated).
 *
 * No admin access is ever granted automatically.
 * email and other values from the request body are NEVER trusted for
 * authentication decisions.
 *
 * SECURITY: All secrets remain in Vercel environment variables.
 *           ADMIN_EMAILS is never returned in any response.
 */

import { getAdminAuth, getAdminFirestore } from '../../lib/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

// ─── Constants ─────────────────────────────────────────────────────────────

const CONFIG_COLLECTION = 'app_config';
const CONFIG_DOC        = 'email_delivery';

// ─── Admin Authorisation ───────────────────────────────────────────────────

/**
 * Parses the ADMIN_EMAILS environment variable into a normalised Set.
 * Addresses are stored lowercase and trimmed.
 * @returns {Set<string>}
 */
function getAdminEmailSet() {
  const raw = process.env.ADMIN_EMAILS || '';
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

/**
 * Verifies that the incoming request comes from an authorised administrator.
 *
 * Steps:
 *  1. Extract the Bearer token from the Authorization header.
 *  2. Verify the Firebase ID token using the Admin SDK.
 *  3. Confirm that email_verified is true on the decoded token.
 *  4. Compare the token email against the server-side ADMIN_EMAILS allowlist.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 * @throws {{ status: number, message: string }}
 */
async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authorisation required.' };
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw { status: 401, message: 'Authorisation required.' };
  }

  // Verify token signature, expiry, and audience with Firebase Admin SDK.
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true); // checkRevoked = true
  } catch {
    // Do not leak the specific Firebase error to the caller.
    throw { status: 401, message: 'Invalid or expired session. Please sign in again.' };
  }

  // Email must be verified in Firebase Authentication.
  if (!decoded.email_verified) {
    throw { status: 403, message: 'Access denied.' };
  }

  // Compare against the server-side allowlist — the caller never supplies the email.
  const adminEmails = getAdminEmailSet();
  if (adminEmails.size === 0) {
    // ADMIN_EMAILS is not configured — deny all admin access.
    throw { status: 403, message: 'Access denied.' };
  }

  if (!adminEmails.has((decoded.email || '').toLowerCase())) {
    throw { status: 403, message: 'Access denied.' };
  }

  return decoded;
}

// ─── Vercel Handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // ── GET — read current email provider configuration ─────────────────────
  if (req.method === 'GET') {
    try {
      await requireAdmin(req);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message });
    }

    const db  = getAdminFirestore();
    const doc = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();

    if (!doc.exists) {
      // Document not yet initialised — return safe defaults.
      return res.status(200).json({
        activeProvider:     'firebase',
        customEmailEnabled: false,
        lastFailureReason:  '',
        updatedAt:          null,
      });
    }

    const data = doc.data();
    return res.status(200).json({
      activeProvider:     data.activeProvider     || 'firebase',
      customEmailEnabled: data.customEmailEnabled === true,
      lastFailureReason:  data.lastFailureReason  || '',
      updatedAt:
        data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
    });
  }

  // ── POST — update email provider configuration ───────────────────────────
  if (req.method === 'POST') {
    try {
      await requireAdmin(req);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message });
    }

    const { customEmailEnabled } = req.body || {};

    if (typeof customEmailEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'customEmailEnabled must be a boolean (true or false).',
      });
    }

    const db = getAdminFirestore();
    const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);

    let updateData;

    if (customEmailEnabled) {
      // Administrator is manually re-enabling EmailJS.
      // Reset the failure reason so the system starts fresh.
      // If the quota is still exhausted, the next API call will disable it again.
      updateData = {
        activeProvider:     'emailjs',
        customEmailEnabled: true,
        lastFailureReason:  '',
        updatedAt:          FieldValue.serverTimestamp(),
      };
    } else {
      // Administrator is manually disabling EmailJS.
      updateData = {
        activeProvider:     'firebase',
        customEmailEnabled: false,
        updatedAt:          FieldValue.serverTimestamp(),
      };
    }

    await ref.set(updateData, { merge: true });

    return res.status(200).json({
      success:            true,
      activeProvider:     updateData.activeProvider,
      customEmailEnabled: updateData.customEmailEnabled,
    });
  }

  // ── Any other method ─────────────────────────────────────────────────────
  return res.status(405).json({ error: 'Method Not Allowed.' });
}
