/**
 * lib/firebase-admin.js
 *
 * Shared Firebase Admin SDK singleton.
 * Imported by api/send-reset-email.js and api/admin/email-settings.js.
 *
 * SECURITY: Credentials are read exclusively from the
 * FIREBASE_SERVICE_ACCOUNT_JSON Vercel environment variable.
 * They are never logged, returned in responses, or committed to source control.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Initialise the Firebase Admin SDK once.
 * Subsequent calls return the existing app.
 * @returns {import('firebase-admin/app').App}
 */
function initAdmin() {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
      'Add the Firebase service-account JSON to your Vercel environment variables.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = typeof serviceAccountJson === 'object' ? serviceAccountJson : JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (err) {
    console.error('[firebase-admin] JSON parse error:', err.message);
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
      'Ensure the value is the complete service-account JSON object.'
    );
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

/**
 * Returns the Firebase Admin Auth instance (lazily loaded to avoid CJS/ESM conflicts).
 * @returns {Promise<import('firebase-admin/auth').Auth>}
 */
export async function getAdminAuth() {
  initAdmin();
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth();
}

/**
 * Returns the Firebase Admin Firestore instance.
 * @returns {import('firebase-admin/firestore').Firestore}
 */
export function getAdminFirestore() {
  initAdmin();
  return getFirestore();
}
