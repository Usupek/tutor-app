const functions = require('firebase-functions');
const admin = require('firebase-admin');
// PERBAIKAN: Import FieldValue secara langsung dari sub-module
const { FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const cors = require('cors');

// Inisialisasi Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Inisialisasi Express App
const app = express();

// Otomatis allow CORS agar bisa dipanggil dari mana saja
app.use(cors({ origin: true }));
app.use(express.json());

// === MIDDLEWARE SECURITY ===

// 1. Cek Token Login (Authentication)
const validateFirebaseIdToken = async (req, res, next) => {
  if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer '))) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
    return res.status(403).send('Unauthorized');
  }

  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedIdToken;
    next();
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    res.status(403).send('Unauthorized');
  }
};

// 2. Cek Apakah User adalah Tutor
const isTutor = async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'tutor') {
      return res.status(403).send('Access denied: Tutors only.');
    }
    next();
  } catch (error) {
    res.status(500).send(error.message);
  }
};

app.use(validateFirebaseIdToken);

// === API ROUTES ===

// Endpoint 1: Mulai Sesi
app.post('/start-session', isTutor, async (req, res) => {
  try {
    const sessionRef = db.collection('sessions').doc();
    
    await sessionRef.set({
      tutorId: req.user.uid,
      // PERBAIKAN: Menggunakan FieldValue yang sudah diimport di atas
      startTime: FieldValue.serverTimestamp(),
      status: 'active',
      studentIds: req.body.studentIds || [] 
    });

    res.status(200).json({ sessionId: sessionRef.id, message: 'Session started' });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Endpoint 2: Akhiri Sesi & Bayar
// Endpoint 2: Akhiri Sesi & Bayar
app.post('/end-session', isTutor, async (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) return res.status(400).send("Session ID is required");

  const sessionRef = db.collection('sessions').doc(sessionId);
  const userRef = db.collection('users').doc(req.user.uid);
  const transactionRef = db.collection('transactions').doc();

  try {
    await db.runTransaction(async (t) => {
      const sessionDoc = await t.get(sessionRef);

      if (!sessionDoc.exists) throw new Error('Session not found');
      if (sessionDoc.data().tutorId !== req.user.uid) throw new Error('Unauthorized access to this session');
      if (sessionDoc.data().status !== 'active') throw new Error('Session already ended');

      // === DEFINISIKAN KONSTANTA DI SINI (PALING ATAS) ===
      const PAY_RATE = 50000;
      const MIN_DURATION = 0.1; // 0.1 menit = 6 detik
      // ===================================================

      const startTime = sessionDoc.data().startTime.toDate();
      const endTime = new Date(); 
      const durationMinutes = (endTime - startTime) / 1000 / 60;

      // === DEBUG LOG (Sekarang aman karena variabel sudah didefinisikan di atas) ===
      console.log("------------------------------------------------");
      console.log(`Start Time:      ${startTime}`);
      console.log(`End Time:        ${endTime}`);
      console.log(`Duration (mins): ${durationMinutes}`);
      console.log(`Min Duration:    ${MIN_DURATION}`);
      console.log("------------------------------------------------");

      if (durationMinutes >= MIN_DURATION) {
        // Update sesi jadi completed
        t.update(sessionRef, {
          endTime: endTime,
          status: 'completed',
          durationMinutes: durationMinutes
        });

        // Tambah Saldo Tutor
        t.update(userRef, {
          walletBalance: FieldValue.increment(PAY_RATE)
        });

        // Catat Transaksi
        t.set(transactionRef, {
          tutorId: req.user.uid,
          amount: PAY_RATE,
          type: 'credit',
          reason: 'session_payment',
          sessionId: sessionId,
          createdAt: FieldValue.serverTimestamp()
        });

        return { paid: true, amount: PAY_RATE };
      } else {
        // Durasi kurang
        console.log("!!! SESSION TOO SHORT !!!");
        
        t.update(sessionRef, {
          endTime: endTime,
          status: 'short',
          durationMinutes: durationMinutes
        });
        return { paid: false, amount: 0 };
      }
    }).then((result) => {
      res.status(200).json({ 
        message: result.paid ? 'Session completed. Payment credited.' : 'Session ended. Duration too short.',
        data: result 
      });
    });

  } catch (error) {
    console.error("TRANSACTION ERROR:", error); // Log error biar kelihatan di terminal
    res.status(400).json({ error: error.message });
  }
});

exports.api = functions.https.onRequest(app);
