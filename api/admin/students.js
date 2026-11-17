/**
 * api/admin/students.js
 *
 * Vercel Serverless Function — GET /api/admin/students
 *
 * Retrieves registered students from Firebase Authentication & Firestore for
 * the Admin Email Notification system.
 *
 * SECURITY:
 * - Requires Authorization: Bearer <Firebase ID Token>
 * - Token verified cryptographically via Google JWKS.
 * - Caller must be in server-side ADMIN_EMAILS allowlist with verified email.
 * - Returns only necessary student details: uid, name, email, studentId.
 * - Source of truth for email is Firebase Authentication.
 */

import { requireAdmin, setCorsAndSecurityHeaders } from '../../lib/admin-auth.js';
import { getAdminAuth, getAdminFirestore } from '../../lib/firebase-admin.js';

export default async function handler(req, res) {
  setCorsAndSecurityHeaders(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed.' });
  }

  try {
    // 1. Authorize Admin
    let adminUser;
    try {
      adminUser = await requireAdmin(req);
    } catch (authErr) {
      return res.status(authErr.status || 401).json({
        success: false,
        error: authErr.message || 'Unauthorized.',
      });
    }

    const auth = await getAdminAuth();
    const db = getAdminFirestore();

    // 2. Parse query parameters
    const searchRaw = (req.query.search || '').toString().trim();
    const searchLower = searchRaw.toLowerCase();
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const pageToken = req.query.pageToken ? req.query.pageToken.toString().trim() : undefined;

    // 3. Retrieve deleted student UIDs/emails to exclude
    let deletedUids = new Set();
    try {
      const deletedSnap = await db.collection('deleted_students').get();
      deletedSnap.forEach((doc) => {
        deletedUids.add(doc.id.toLowerCase());
        const data = doc.data();
        if (data.uid) deletedUids.add(data.uid.toLowerCase());
        if (data.email) deletedUids.add(data.email.toLowerCase());
      });
    } catch (e) {
      console.warn('[api/admin/students] Could not load deleted_students filter:', e.message);
    }

    const studentsMap = new Map(); // uid -> student object

    // 4. If exact email search, attempt direct lookup
    if (searchLower.includes('@')) {
      try {
        const directUser = await auth.getUserByEmail(searchLower);
        if (directUser && !deletedUids.has(directUser.uid.toLowerCase()) && !deletedUids.has((directUser.email || '').toLowerCase())) {
          studentsMap.set(directUser.uid, {
            uid: directUser.uid,
            name: directUser.displayName || directUser.email.split('@')[0],
            email: directUser.email,
            studentId: undefined,
          });
        }
      } catch (err) {
        // User not found with exact email; continue to general search
      }
    }

    // 5. Query Firestore 'users' with prefix search if search query provided
    if (searchLower.length >= 2) {
      try {
        const [emailMatches, nameMatches] = await Promise.all([
          db.collection('users')
            .where('email', '>=', searchLower)
            .where('email', '<=', searchLower + '\uf8ff')
            .limit(limitNum)
            .get()
            .catch(() => ({ docs: [] })),
          db.collection('users')
            .where('name', '>=', searchRaw)
            .where('name', '<=', searchRaw + '\uf8ff')
            .limit(limitNum)
            .get()
            .catch(() => ({ docs: [] })),
        ]);

        const firestoreDocs = [...(emailMatches.docs || []), ...(nameMatches.docs || [])];
        for (const doc of firestoreDocs) {
          const data = doc.data();
          const uid = data.uid || doc.id;
          if (deletedUids.has(uid.toLowerCase())) continue;

          // Verify with Auth to ensure valid registered account & latest email
          try {
            const authRecord = await auth.getUser(uid);
            if (authRecord && !deletedUids.has((authRecord.email || '').toLowerCase())) {
              studentsMap.set(uid, {
                uid: authRecord.uid,
                name: data.name || authRecord.displayName || (authRecord.email ? authRecord.email.split('@')[0] : 'KCET Student'),
                email: authRecord.email || data.email,
                studentId: data.formattedStudentId || data.studentId || undefined,
              });
            }
          } catch {
            // Not in Auth or deleted
          }
        }
      } catch (e) {
        console.warn('[api/admin/students] Prefix search fallback notice:', e.message);
      }
    }

    // 6. Primary Firebase Auth user listing (supports pagination)
    let nextPageToken = null;
    const authList = await auth.listUsers(limitNum, pageToken);
    nextPageToken = authList.pageToken || null;

    // Filter and collect candidate UIDs from Firebase Auth
    const uidsToEnrich = [];
    for (const u of authList.users) {
      if (!u.email) continue; // Skip non-email accounts
      const uidLow = u.uid.toLowerCase();
      const emailLow = u.email.toLowerCase();

      if (deletedUids.has(uidLow) || deletedUids.has(emailLow)) continue;

      // In-memory search filter if search term provided
      if (searchLower) {
        const matchesEmail = emailLow.includes(searchLower);
        const matchesName = (u.displayName || '').toLowerCase().includes(searchLower);
        if (!matchesEmail && !matchesName) continue;
      }

      if (!studentsMap.has(u.uid)) {
        studentsMap.set(u.uid, {
          uid: u.uid,
          name: u.displayName || u.email.split('@')[0],
          email: u.email,
          studentId: undefined,
        });
        uidsToEnrich.push(u.uid);
      }
    }

    // 7. Enrich student details from Firestore '/users'
    if (uidsToEnrich.length > 0) {
      try {
        // Fetch up to 50 docs concurrently
        const enrichBatches = [];
        for (let i = 0; i < uidsToEnrich.length; i += 20) {
          const batchUids = uidsToEnrich.slice(i, i + 20);
          enrichBatches.push(
            Promise.all(batchUids.map((uid) => db.collection('users').doc(uid).get().catch(() => null)))
          );
        }
        const batchResults = await Promise.all(enrichBatches);
        for (const docGroup of batchResults) {
          for (const docSnap of docGroup) {
            if (docSnap && docSnap.exists) {
              const data = docSnap.data();
              const existing = studentsMap.get(docSnap.id);
              if (existing) {
                if (data.name && (!existing.name || existing.name === existing.email?.split('@')[0])) {
                  existing.name = data.name;
                }
                existing.studentId = data.formattedStudentId || data.studentId || undefined;
              }
            }
          }
        }
      } catch (enrichErr) {
        console.warn('[api/admin/students] Enrichment non-fatal notice:', enrichErr.message);
      }
    }

    const students = Array.from(studentsMap.values());

    return res.status(200).json({
      success: true,
      students,
      nextPageToken,
    });
  } catch (fatalErr) {
    console.error('[api/admin/students FATAL]:', fatalErr);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while retrieving students.',
    });
  }
}
