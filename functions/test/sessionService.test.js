const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

// Import service yang kamu sudah pakai di routes
const { startSession, endSession } = require("../services/sessionService");

// Pastikan ini sesuai projectId kamu
const PROJECT_ID = "tutor-app-70a8a";

describe("sessionService (Firestore Emulator)", () => {
  let db;

  beforeAll(() => {
    // Paksa admin SDK connect ke emulator
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = admin.firestore();
  });

  async function clearCollection(name) {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  beforeEach(async () => {
    // bersihin data sebelum tiap test
    await clearCollection("sessions");
    await clearCollection("users");
    await clearCollection("transactions");
  });

  test("startSession: valid 1..6 students -> creates active session", async () => {
    const tutorId = "t1";
    // user doc tutor (role biasanya dicek di middleware, tapi service tidak cek role)
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const r = await startSession(db, { tutorId, studentIds: ["s1", "s2"] });
    expect(r.sessionId).toBeTruthy();

    const snap = await db.collection("sessions").doc(r.sessionId).get();
    expect(snap.exists).toBe(true);

    const s = snap.data();
    expect(s.tutorId).toBe(tutorId);
    expect(s.status).toBe("active");
    expect(Array.isArray(s.studentIds)).toBe(true);
    expect(s.studentIds.length).toBe(2);
    expect(s.startTime).toBeTruthy();
    expect(s.paid).toBe(false);
  });

  test("startSession: invalid > 6 students -> throws 400", async () => {
    const tutorId = "t1";
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const students = ["s1","s2","s3","s4","s5","s6","s7"];
    await expect(startSession(db, { tutorId, studentIds: students }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test("startSession: prevents overlapping active session -> 409", async () => {
    const tutorId = "t1";
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const a = await startSession(db, { tutorId, studentIds: ["s1"] });
    expect(a.sessionId).toBeTruthy();

    await expect(startSession(db, { tutorId, studentIds: ["s2"] }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test("endSession: session not found -> 404", async () => {
    await expect(endSession(db, { tutorId: "t1", sessionId: "nope" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test("endSession: wrong tutor -> 403", async () => {
    const sessionId = "sess1";
    await db.collection("sessions").doc(sessionId).set({
      tutorId: "t-other",
      studentIds: ["s1"],
      status: "active",
      startTime: Timestamp.fromMillis(Date.now() - 46 * 60 * 1000),
      paid: false
    });

    await expect(endSession(db, { tutorId: "t1", sessionId }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test("endSession: too short -> status short and no payment", async () => {
    const tutorId = "t1";
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const sessionId = "sess1";
    await db.collection("sessions").doc(sessionId).set({
      tutorId,
      studentIds: ["s1"],
      status: "active",
      startTime: Timestamp.fromMillis(Date.now() - 1 * 60 * 1000), // 1 menit
      paid: false
    });

    const r = await endSession(db, { tutorId, sessionId });

    expect(r.status).toBe("short");
    expect(r.paid).toBe(false);

    const user = await db.collection("users").doc(tutorId).get();
    expect(user.data().walletBalance || 0).toBe(0);

    const txSnap = await db.collection("transactions").get();
    expect(txSnap.empty).toBe(true);
  });

  test("endSession: >= MIN_DURATION -> status completed and payment credited + tx logged", async () => {
    const tutorId = "t1";
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const sessionId = "sess1";
    await db.collection("sessions").doc(sessionId).set({
      tutorId,
      studentIds: ["s1"],
      status: "active",
      startTime: Timestamp.fromMillis(Date.now() - 46 * 60 * 1000), // 46 menit lalu
      paid: false
    });

    const r = await endSession(db, { tutorId, sessionId });

    expect(r.status).toBe("completed");
    expect(r.paid).toBe(true);
    expect(r.amount).toBe(50000);
    expect(r.payoutTxId).toBeTruthy();

    const user = await db.collection("users").doc(tutorId).get();
    expect(user.data().walletBalance).toBe(50000);

    const tx = await db.collection("transactions").doc(r.payoutTxId).get();
    expect(tx.exists).toBe(true);
    expect(tx.data().amount).toBe(50000);
    expect(tx.data().tutorId).toBe(tutorId);

    const session = await db.collection("sessions").doc(sessionId).get();
    expect(session.data().paid).toBe(true);
    expect(session.data().payoutTxId).toBe(r.payoutTxId);
  });

  test("endSession: idempotent (2nd call) -> no double payment", async () => {
    const tutorId = "t1";
    await db.collection("users").doc(tutorId).set({ role: "tutor", walletBalance: 0 });

    const sessionId = "sess1";
    await db.collection("sessions").doc(sessionId).set({
      tutorId,
      studentIds: ["s1"],
      status: "active",
      startTime: Timestamp.fromMillis(Date.now() - 46 * 60 * 1000),
      paid: false
    });

    const first = await endSession(db, { tutorId, sessionId });
    const second = await endSession(db, { tutorId, sessionId });

    expect(first.paid).toBe(true);
    expect(second.paid).toBe(true);

    // saldo harus tetap 50k (tidak jadi 100k)
    const user = await db.collection("users").doc(tutorId).get();
    expect(user.data().walletBalance).toBe(50000);

    // transaksi hanya 1
    const txSnap = await db.collection("transactions").get();
    expect(txSnap.size).toBe(1);
  });
});

