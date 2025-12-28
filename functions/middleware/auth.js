// middleware/auth.js
const admin = require("firebase-admin");

function httpError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

async function validateFirebaseIdToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) throw httpError(401, "Missing Bearer token");

    const idToken = header.substring("Bearer ".length);
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (e) {
    return next(httpError(401, e.message || "Unauthorized"));
  }
}

/**
 * Tutor check berdasarkan Firestore:
 * users/{uid}.role === 'tutor'
 *
 * (Pastikan Firestore Rules TIDAK mengizinkan user mengubah role sendiri)
 */
async function requireTutor(req, res, next) {
  try {
    const db = req.app.locals.db;
    const uid = req.user && req.user.uid;
    if (!uid) throw httpError(401, "Unauthorized");

    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) throw httpError(403, "Access denied: Tutors only");

    const { role } = snap.data();
    if (role !== "tutor") throw httpError(403, "Access denied: Tutors only");

    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { validateFirebaseIdToken, requireTutor, httpError };

