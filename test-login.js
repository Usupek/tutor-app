require("dotenv").config();

const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword, connectAuthEmulator } = require("firebase/auth");

const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "tutor-app.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

connectAuthEmulator(auth, process.env.AUTH_EMULATOR_URL);

async function getToken() {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      process.env.TEST_EMAIL,
      process.env.TEST_PASSWORD
    );
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

