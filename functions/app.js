// app.js
const express = require("express");
const cors = require("cors");

const { validateFirebaseIdToken } = require("./middleware/auth");
const { notFoundHandler, errorHandler } = require("./middleware/error");
const sessionsRoutes = require("./routes/sessions");

function createApp({ db }) {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());

  // inject db ke app locals supaya middleware/routes bisa akses
  app.locals.db = db;

  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  // Auth for all API endpoints
  app.use(validateFirebaseIdToken);

  // Routes
  app.use("/", sessionsRoutes);

  // Errors
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;

