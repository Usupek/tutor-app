// index.js
require("dotenv").config();
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const createApp = require("./app");

admin.initializeApp();
const db = admin.firestore();

const app = createApp({ db });

exports.api = functions.https.onRequest(app);

