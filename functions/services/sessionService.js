// services/sessionService.js
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { httpError } = require("../middleware/auth");
const { PAY_RATE, MAX_STUDENTS, MIN_DURATION_MINUTES } = require("../config/constants");

async function startSession(db, { tutorId, studentIds }) {
  const ids = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
  if (ids.length < 1 || ids.length > MAX_STUDENTS) {
    throw httpError(400, `studentIds must be 1..${MAX_STUDENTS}`);
  }

  const now = Timestamp.now(); // ✅ FIX

  const sessionRef = db.collection("sessions").doc();
  const result = await db.runTransaction(async (t) => {
    const q = db.collection("sessions")
      .where("tutorId", "==", tutorId)
      .where("status", "==", "active")
      .limit(1);

    const ongoing = await t.get(q);
    if (!ongoing.empty) throw httpError(409, "Tutor already has an active session");

    t.set(sessionRef, {
      tutorId,
      studentIds: ids,
      status: "active",
      startTime: now,
      endTime: null,
      durationMinutes: null,
      paid: false,
      payoutTxId: null,
      createdAt: now,
      updatedAt: now
    });

    return { sessionId: sessionRef.id };
  });

  return result;
}

async function endSession(db, { tutorId, sessionId }) {
  if (!sessionId) throw httpError(400, "Session ID is required");

  const now = Timestamp.now(); // ✅ FIX

  const sessionRef = db.collection("sessions").doc(sessionId);
  const userRef = db.collection("users").doc(tutorId);
  const txRef = db.collection("transactions").doc();

  return await db.runTransaction(async (t) => {
    const snap = await t.get(sessionRef);
    if (!snap.exists) throw httpError(404, "Session not found");

    const s = snap.data();
    if (s.tutorId !== tutorId) throw httpError(403, "Unauthorized access to this session");

    if (s.status !== "active") {
      return {
        sessionId,
        status: s.status,
        paid: !!s.paid,
        payoutTxId: s.payoutTxId ?? null,
        durationMinutes: s.durationMinutes ?? null
      };
    }

    if (!s.startTime) throw httpError(500, "Session missing startTime");
    const durationMinutes = (now.toMillis() - s.startTime.toMillis()) / 1000 / 60;
    const eligible = durationMinutes >= MIN_DURATION_MINUTES;

    if (!eligible) {
      t.update(sessionRef, { endTime: now, status: "short", durationMinutes, paid: false, updatedAt: now });
      return { sessionId, status: "short", paid: false, amount: 0, durationMinutes };
    }

    t.update(sessionRef, {
      endTime: now,
      status: "completed",
      durationMinutes,
      paid: true,
      payoutTxId: txRef.id,
      updatedAt: now
    });

    // aman walau user doc belum ada
    t.set(userRef, { walletBalance: FieldValue.increment(PAY_RATE), updatedAt: now }, { merge: true });

    t.set(txRef, {
      tutorId,
      amount: PAY_RATE,
      type: "credit",
      reason: "session_payment",
      sessionId,
      createdAt: now
    });

    return { sessionId, status: "completed", paid: true, amount: PAY_RATE, payoutTxId: txRef.id, durationMinutes };
  });
}

module.exports = { startSession, endSession };

