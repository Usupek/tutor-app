// config/constants.js
module.exports = {
  PAY_RATE: 50_000,
  MAX_STUDENTS: 6,

  // default 45 menit, tapi bisa override utk demo cepat:
  // MIN_DURATION_MINUTES=0.1 firebase emulators:start
  MIN_DURATION_MINUTES: Number(process.env.MIN_DURATION_MINUTES ?? 45),

  // kalau kamu mau tambah subscription check nanti:
  ENFORCE_SUBSCRIPTION: String(process.env.ENFORCE_SUBSCRIPTION ?? "false") === "true",
};

