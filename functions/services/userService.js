// services/userService.js
const { httpError } = require("../middleware/auth");

async function getUser(db, uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "User not found");
  return { ref, data: snap.data() };
}

module.exports = { getUser };

