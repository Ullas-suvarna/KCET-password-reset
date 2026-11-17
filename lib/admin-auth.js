/**
 * lib/admin-auth.js
 *
 * Shared Admin Authorization and Security Helpers for Admin APIs.
 *
 * Verifies that incoming requests:
 * 1. Bear a valid Firebase ID Token (cryptographically checked using Google's JWKS).
 * 2. Belong to a verified email account (email_verified === true).
 * 3. Match an address in the server-side ADMIN_EMAILS environment variable.
 */

import * as jose from 'jose';

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'kcet-app-c0457';

const GOOGLE_JWKS = jose.createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * Parses the ADMIN_EMAILS environment variable into a normalised Set.
 * @returns {Set<string>}
 */
export function getAdminEmailSet() {
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
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<any>} The decoded JWT payload
 * @throws {{ status: number, message: string }}
 */
export async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authorisation required. Bearer token missing.' };
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw { status: 401, message: 'Authorisation required. Token empty.' };
  }

  let decoded;
  try {
    const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    decoded = payload;
  } catch (jwtErr) {
    console.error('[requireAdmin] JWT verify error:', jwtErr.message);
    throw { status: 401, message: 'Invalid or expired session. Please sign in again.' };
  }

  // Email must be verified in Firebase Authentication
  if (!decoded.email_verified) {
    throw { status: 403, message: 'Access denied. Administrator email must be verified.' };
  }

  // Compare against the server-side allowlist
  const adminEmails = getAdminEmailSet();
  if (adminEmails.size === 0) {
    console.error('[requireAdmin] ADMIN_EMAILS environment variable is not configured.');
    throw { status: 403, message: 'Access denied. Admin allowlist is not configured.' };
  }

  const callerEmail = (decoded.email || '').toLowerCase().trim();
  if (!adminEmails.has(callerEmail)) {
    console.warn(`[requireAdmin] Non-admin access attempt by: ${callerEmail}`);
    throw { status: 403, message: 'Access denied. Account is not an authorised administrator.' };
  }

  return decoded;
}

/**
 * Applies standard security and CORS headers to API responses.
 * @param {import('http').ServerResponse} res
 * @param {string} allowedMethods
 */
export function setCorsAndSecurityHeaders(res, allowedMethods = 'GET, POST, OPTIONS') {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
