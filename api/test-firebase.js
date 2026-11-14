export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};
  
  try {
    results.appImport = await import('firebase-admin/app').then(() => 'OK').catch(e => e.message);
  } catch (e) { results.appImport = e.message; }

  try {
    results.authImport = await import('firebase-admin/auth').then(() => 'OK').catch(e => e.message);
  } catch (e) { results.authImport = e.message; }

  try {
    results.firestoreImport = await import('firebase-admin/firestore').then(() => 'OK').catch(e => e.message);
  } catch (e) { results.firestoreImport = e.message; }

  try {
    results.libImport = await import('../lib/firebase-admin.js').then(() => 'OK').catch(e => e.message);
  } catch (e) { results.libImport = e.message; }

  res.status(200).json(results);
}
