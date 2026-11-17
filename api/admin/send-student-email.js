/**
 * api/admin/send-student-email.js
 *
 * Vercel Serverless Function — POST /api/admin/send-student-email
 *
 * Sends a dynamic custom notification email to an existing registered student
 * using the dedicated NEW EmailJS account.
 *
 * SECURITY & ARCHITECTURE:
 * - Requires Authorization: Bearer <Firebase ID Token> from an authorized administrator.
 * - Recipient email is derived strictly from Firebase Authentication using studentUid.
 *   Client-supplied recipient emails are NEVER accepted or trusted.
 * - Uses process.env.EMAILJS_ADMIN_* environment variables exclusively.
 *   Old EmailJS credentials are NEVER touched or modified.
 * - Records every delivery attempt in Firestore 'admin_email_logs' collection.
 * - Sanitizes subject and message; enforces maximum length limits.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, setCorsAndSecurityHeaders } from '../../lib/admin-auth.js';
import { getAdminAuth, getAdminFirestore } from '../../lib/firebase-admin.js';

const EMAILJS_TIMEOUT_MS = 15_000;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5_000;

export default async function handler(req, res) {
  setCorsAndSecurityHeaders(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed.' });
  }

  try {
    // 1. Authenticate administrator
    let adminUser;
    try {
      adminUser = await requireAdmin(req);
    } catch (authErr) {
      return res.status(authErr.status || 401).json({
        success: false,
        error: authErr.message || 'Unauthorized.',
      });
    }

    const { studentUid, subject, message } = req.body || {};

    // 2. Validate input fields
    if (!studentUid || typeof studentUid !== 'string' || !studentUid.trim()) {
      return res.status(400).json({ success: false, error: 'Valid studentUid is required.' });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Email subject cannot be empty.' });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Email message body cannot be empty.' });
    }

    const cleanSubject = subject.trim().slice(0, MAX_SUBJECT_LENGTH);
    const cleanMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);
    const cleanStudentUid = studentUid.trim();

    // 3. Verify NEW EmailJS credentials in server environment variables
    const serviceId  = process.env.EMAILJS_ADMIN_SERVICE_ID;
    const publicKey  = process.env.EMAILJS_ADMIN_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_ADMIN_PRIVATE_KEY;
    const templateId = process.env.EMAILJS_ADMIN_NOTIFICATION_TEMPLATE_ID;

    if (!serviceId || !publicKey || !privateKey || !templateId) {
      console.error('[send-student-email] Missing NEW EmailJS environment variables:', {
        hasServiceId:  Boolean(serviceId),
        hasPublicKey:  Boolean(publicKey),
        hasPrivateKey: Boolean(privateKey),
        hasTemplateId: Boolean(templateId),
      });
      return res.status(500).json({
        success: false,
        error: 'EmailJS Admin Notification service is not configured on the server. Please verify Vercel environment variables.',
      });
    }

    // 4. Retrieve student record strictly from Firebase Authentication
    const auth = await getAdminAuth();
    const db = getAdminFirestore();

    let studentRecord;
    try {
      studentRecord = await auth.getUser(cleanStudentUid);
    } catch (userErr) {
      console.error('[send-student-email] Student lookup error:', userErr.message);
      return res.status(404).json({
        success: false,
        error: 'Student record not found in Firebase Authentication.',
      });
    }

    const registeredEmail = (studentRecord.email || '').trim().toLowerCase();
    if (!registeredEmail) {
      return res.status(400).json({
        success: false,
        error: 'The selected student account does not have a registered email address in Firebase.',
      });
    }

    // Enrich student name if available in Firestore
    let studentName = studentRecord.displayName || '';
    try {
      const userDoc = await db.collection('users').doc(cleanStudentUid).get();
      if (userDoc.exists && userDoc.data().name) {
        studentName = userDoc.data().name;
      }
    } catch {
      // Non-fatal if Firestore profile read fails
    }
    if (!studentName) {
      studentName = registeredEmail.split('@')[0];
    }

    // 5. Dispatch email via NEW EmailJS account REST API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMAILJS_TIMEOUT_MS);

    let emailjsResponse;
    let responseText = '';
    let isDeliveryUncertain = false;

    try {
      emailjsResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_id:  serviceId,
          template_id: templateId,
          user_id:     publicKey,
          accessToken: privateKey,
          template_params: {
            to_email:     registeredEmail,
            subject:      cleanSubject,
            message:      cleanMessage,
            student_name: studentName,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      responseText = await emailjsResponse.text();
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr.name === 'AbortError') {
        isDeliveryUncertain = true;
      } else {
        console.error('[send-student-email] Network error reaching EmailJS:', fetchErr.message);
        // Record failure in logs
        await recordEmailLog(db, {
          recipientUid: cleanStudentUid,
          recipientEmail: registeredEmail,
          recipientName: studentName,
          subject: cleanSubject,
          adminUid: adminUser.sub || adminUser.user_id,
          adminEmail: adminUser.email || '',
          status: 'NETWORK_ERROR',
          error: 'Failed to contact EmailJS provider.',
        });

        return res.status(502).json({
          success: false,
          error: 'Could not contact EmailJS server. Please check your internet connection and try again.',
        });
      }
    }

    if (isDeliveryUncertain) {
      await recordEmailLog(db, {
        recipientUid: cleanStudentUid,
        recipientEmail: registeredEmail,
        recipientName: studentName,
        subject: cleanSubject,
        adminUid: adminUser.sub || adminUser.user_id,
        adminEmail: adminUser.email || '',
        status: 'UNCERTAIN',
        error: 'EmailJS request timed out; delivery status uncertain.',
      });

      return res.status(200).json({
        success: false,
        deliveryUncertain: true,
        message: 'The email request timed out. EmailJS may still be processing the message. Please check logs in a few minutes before resending.',
      });
    }

    // 6. Handle EmailJS response status
    const isSuccess = emailjsResponse && emailjsResponse.ok;

    // Log the transaction in Firestore admin_email_logs
    await recordEmailLog(db, {
      recipientUid: cleanStudentUid,
      recipientEmail: registeredEmail,
      recipientName: studentName,
      subject: cleanSubject,
      adminUid: adminUser.sub || adminUser.user_id,
      adminEmail: adminUser.email || '',
      status: isSuccess ? 'SUBMITTED' : 'FAILED',
      error: isSuccess ? null : `EmailJS HTTP ${emailjsResponse.status}: ${responseText.slice(0, 300)}`,
    });

    if (isSuccess) {
      return res.status(200).json({
        success: true,
        provider: 'emailjs_admin',
        recipientEmail: registeredEmail,
        message: `Notification email successfully submitted to EmailJS for ${registeredEmail}.`,
      });
    }

    console.error('[send-student-email] EmailJS rejected delivery:', emailjsResponse.status, responseText);
    return res.status(emailjsResponse.status === 400 || emailjsResponse.status === 403 ? 400 : 502).json({
      success: false,
      error: `EmailJS submission failed (${emailjsResponse.status}): ${responseText || 'Unknown provider rejection.'}`,
    });
  } catch (fatalErr) {
    console.error('[send-student-email FATAL]:', fatalErr);
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while sending the email.',
    });
  }
}

/**
 * Helper to record sending attempts in Firestore 'admin_email_logs'.
 */
async function recordEmailLog(db, logData) {
  try {
    await db.collection('admin_email_logs').add({
      ...logData,
      timestamp: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });
  } catch (logErr) {
    console.warn('[send-student-email] Failed to write admin_email_logs:', logErr.message);
  }
}
