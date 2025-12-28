// routes/sessions.js
const express = require("express");
const router = express.Router();

const { requireTutor, httpError } = require("../middleware/auth");
const { startSession, endSession } = require("../services/sessionService");

// POST /start-session
router.post("/start-session", requireTutor, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const tutorId = req.user.uid;
    const studentIds = req.body.studentIds;

    const result = await startSession(db, { tutorId, studentIds });
    res.status(200).json({ message: "Session started", ...result });
  } catch (e) {
    next(e);
  }
});

// POST /end-session  body: { sessionId }
router.post("/end-session", requireTutor, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const tutorId = req.user.uid;
    const sessionId = req.body.sessionId;

    if (!sessionId) throw httpError(400, "Session ID is required");

    const result = await endSession(db, { tutorId, sessionId });

    res.status(200).json({
      message: result.paid ? "Session completed. Payment credited." : "Session ended. No payment.",
      data: result
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

