export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const admin = await import('firebase-admin');
    const firestore = await import('firebase-admin/firestore');
    res.status(200).json({
      ok: true,
      hasAdmin: Boolean(admin),
      hasFieldValue: Boolean(firestore.FieldValue),
      envVarSet: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      adminEmailsSet: Boolean(process.env.ADMIN_EMAILS)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
