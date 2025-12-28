// test-login.js
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

// Konfigurasi agar connect ke Emulator
const firebaseConfig = {
  apiKey: "fake-api-key", // Di emulator, key ini bebas
  authDomain: "tutor-app.firebaseapp.com",
  projectId: "tutor-app-70a8a", // Sesuaikan dengan project ID di log kamu
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Arahkan Auth ke Emulator (PENTING)
const { connectAuthEmulator } = require("firebase/auth");
connectAuthEmulator(auth, "http://127.0.0.1:9099");

async function getToken() {
  try {
    // Login user yang tadi dibuat di UI
    const userCredential = await signInWithEmailAndPassword(auth, "tes@tes.com", "password");
    const token = await userCredential.user.getIdToken();
    
    console.log("\n=== COPY TOKEN DI BAWAH INI ===");
    console.log(token);
    console.log("==============================\n");
    process.exit(0);
  } catch (error) {
    console.error("Error login:", error.message);
    process.exit(1);
  }
}

getToken();
