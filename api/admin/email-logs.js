/**
 * api/admin/email-logs.js
 *
 * Vercel Serverless Function — GET /api/admin/email-logs
 *
 * Fetches recent admin email notification dispatch logs from Firestore 'admin_email_logs'.
 *
 * SECURITY:
 * - Requires Authorization: Bearer <Firebase ID Token> from an authorized administrator.
 * - Restricted exclusively to allowlisted admins in ADMIN_EMAILS.
 * - Returns sanitized log data (never returns private keys, tokens, or credentials).
 */

import { requireAdmin, setCorsAndSecurityHeaders } from '../../lib/admin-auth.js';
import { getAdminFirestore } from '../../lib/firebase-admin.js';

export default async function handler(req, res) {
  setCorsAndSecurityHeaders(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed.' });
  }

  try {
    let adminUser;
    try {
      adminUser = await requireAdmin(req);
    } catch (authErr) {
      return res.status(authErr.status || 401).json({
        success: false,
        error: authErr.message || 'Unauthorized.',
      });
    }

    const db = getAdminFirestore();
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    let logs = [];
    try {
      const snap = await db
        .collection('admin_email_logs')
        .orderBy('timestamp', 'desc')
        .limit(limitNum)
        .get();

      logs = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          recipientUid: d.recipientUid || '',
          recipientEmail: d.recipientEmail || '',
          recipientName: d.recipientName || '',
          subject: d.subject || '',
          adminEmail: d.adminEmail || '',
          status: d.status || 'UNKNOWN',
          createdAt: d.createdAtIso || (d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : ''),
          error: d.error || null,
        };
      });
    } catch (orderErr) {
      // Fallback if index on timestamp desc is not yet built
      console.warn('[api/admin/email-logs] Fallback query without orderBy:', orderErr.message);
      const snap = await db.collection('admin_email_logs').limit(limitNum).get();
      logs = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          recipientUid: d.recipientUid || '',
          recipientEmail: d.recipientEmail || '',
          recipientName: d.recipientName || '',
          subject: d.subject || '',
          adminEmail: d.adminEmail || '',
          status: d.status || 'UNKNOWN',
          createdAt: d.createdAtIso || '',
          error: d.error || null,
        };
      });
    }

    return res.status(200).json({
      success: true,
      logs,
    });
  } catch (fatalErr) {
    console.error('[api/admin/email-logs FATAL]:', fatalErr);
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while retrieving email logs.',
    });
  }
}
