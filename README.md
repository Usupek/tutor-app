# Tutoring App Backend (Firebase Auth + Firestore + Cloud Functions + Express)

Backend implementation for a tutoring application case study.

This repository focuses on:

* Starting and ending tutoring sessions
* Session duration verification (45 minutes) for tutor payout
* Tutor wallet balance updates and transaction logging (simulated, stored in Firestore)
* Security: only authenticated, authorized tutors can trigger payouts
* Unit tests for service logic

> Note: This project is designed to run locally using **Firebase Emulator Suite**.

---

## Tech Stack

* **Firebase Authentication** (ID token authentication)
* **Firestore** (data storage)
* **Cloud Functions for Firebase** (hosting backend logic)
* **Express.js** (HTTP routing)
* **Jest** (unit testing)

---

## Code Structure

All backend code lives in the `functions/` directory.

```
functions/
  index.js
  app.js
  config/
    constants.js
  middleware/
    auth.js
    error.js
  routes/
    sessions.js
  services/
    sessionService.js
    userService.js
  test/
    sessionService.test.js
  jest.config.js
```

### Entry points

* **`functions/index.js`**

  * Initializes `firebase-admin`
  * Creates a Firestore client
  * Builds the Express app
  * Exports a single HTTPS function: `exports.api`

* **`functions/app.js`**

  * Configures Express middleware (`cors`, `json`)
  * Attaches `db` to `app.locals.db`
  * Registers authentication middleware for all routes
  * Mounts API routes (`routes/sessions.js`)
  * Adds not-found and error handlers

---

## Firestore Data Model

### `users/{uid}`

Stores user identity/role and (for tutors) wallet state.

Fields:

* `role`: `"tutor" | "student"`
* `walletBalance`: `number` (tutor wallet balance, simulated)
* `updatedAt`: `Timestamp`

Example:

```json
{
  "role": "tutor",
  "walletBalance": 0,
  "updatedAt": "<Timestamp>"
}
```

### `sessions/{sessionId}`

Stores session lifecycle, ownership, duration, and payout state.

Fields:

* `tutorId`: `string`
* `studentIds`: `string[]` (max 6)
* `status`: `"active" | "completed" | "short"`
* `startTime`: `Timestamp`
* `endTime`: `Timestamp | null`
* `durationMinutes`: `number | null`
* `paid`: `boolean` (anti double payout)
* `payoutTxId`: `string | null`
* `createdAt`, `updatedAt`: `Timestamp`

Example:

```json
{
  "tutorId": "uidTutor",
  "studentIds": ["murid1", "murid2"],
  "status": "active",
  "startTime": "<Timestamp>",
  "endTime": null,
  "durationMinutes": null,
  "paid": false,
  "payoutTxId": null,
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>"
}
```

### `transactions/{txId}`

Audit log for every wallet balance change.

Fields:

* `tutorId`: `string`
* `sessionId`: `string`
* `amount`: `number` (expected: 50000)
* `type`: `"credit"`
* `reason`: `"session_payment"`
* `createdAt`: `Timestamp`

Example:

```json
{
  "tutorId": "uidTutor",
  "sessionId": "session123",
  "amount": 50000,
  "type": "credit",
  "reason": "session_payment",
  "createdAt": "<Timestamp>"
}
```

---

## API

The Cloud Function export is named **`api`**.

Base URL (emulator):

```
http://127.0.0.1:5001/<PROJECT_ID>/us-central1/api
```

All endpoints require:

* `Authorization: Bearer <FIREBASE_ID_TOKEN>`
* `Content-Type: application/json`

### `POST /start-session`

Starts a tutoring session.

Request body:

```json
{ "studentIds": ["murid2", "murid3"] }
```

Behavior:

* Tutor-only
* Validates `studentIds` length (1..6)
* Prevents overlapping sessions (a tutor may only have one `active` session)
* Writes `sessions/{sessionId}` with `status=active` and server-side `startTime`

Response example:

```json
{ "message": "Session started", "sessionId": "<id>" }
```

### `POST /end-session`

Ends a tutoring session and performs payout logic.

Request body:

```json
{ "sessionId": "<SESSION_ID>" }
```

Behavior:

* Tutor-only
* Enforces session ownership (`sessions/{sessionId}.tutorId` must match the caller UID)
* Computes session duration
* If duration >= 45 minutes: marks session `completed` and credits 50,000
* If duration < 45 minutes: marks session `short` and does not credit
* Writes wallet + transaction within a Firestore transaction

Response example:

```json
{
  "message": "Session completed. Payment credited.",
  "data": {
    "sessionId": "<id>",
    "status": "completed",
    "paid": true,
    "amount": 50000,
    "payoutTxId": "<txId>",
    "durationMinutes": 45.2
  }
}
```

---

## Security Model

### Authentication

All API requests must provide a Firebase Auth ID token:

* Verified server-side with `admin.auth().verifyIdToken()` (`middleware/auth.js`).

### Authorization

Tutor-only access is enforced by checking Firestore:

* `users/{uid}.role === "tutor"`

### Session ownership

A tutor may only end sessions they own:

* `sessions/{sessionId}.tutorId === caller uid`

### Preventing payout abuse (double payout)

The session document includes a `paid` flag and `status` transitions:

* Only sessions in `status=active` are eligible for payout
* Once ended, subsequent calls return the existing state without re-crediting

### Firestore Security Rules

Client writes are blocked for critical collections to prevent bypassing the API:

* `users`: cannot change `role` or `walletBalance`
* `sessions`: cannot alter status/duration from client
* `transactions`: cannot create fake payment logs

> Writes are performed by Cloud Functions (Admin SDK), which is not restricted by client rules.

---

## Configuration

### `functions/config/constants.js`

* `PAY_RATE`: 50,000
* `MAX_STUDENTS`: 6
* `MIN_DURATION_MINUTES`: defaults to `45` (can be overridden via env)

### Environment variables

Common (optional) for local runs:

* `MIN_DURATION_MINUTES` — minimum session duration required for payout (default 45)

Example (`functions/.env`):

```env
MIN_DURATION_MINUTES=45
```

---

## Running Locally (Emulator)

### Install dependencies

Root (optional, if you use the root scripts like `test-login.js`):

```bash
npm install
```

Functions:

```bash
cd functions
npm install
```

### Start emulators

From the project root:

```bash
firebase emulators:start
```

Emulator UI:

* `http://127.0.0.1:4000`

---

## Unit Tests

### Location

* `functions/test/sessionService.test.js`

### What is tested

The tests focus on **service-level behavior** (`services/sessionService.js`):

* Session creation constraints (1..6 students)
* Overlapping active session prevention
* End-session outcomes (short vs completed)
* Ownership and not-found errors
* Idempotency (no double payout)

### Running tests

1. Ensure Firestore emulator is running on `127.0.0.1:8080`
2. Run:

```bash
cd functions
npm test
```

The test suite connects to Firestore emulator via:

* `process.env.FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`

---

## Key Files Reference

* `services/sessionService.js`

  * Implements transactional updates:

    * session status update
    * wallet increment
    * transaction record creation

* `middleware/auth.js`

  * Verifies Firebase ID token
  * Enforces tutor role

* `routes/sessions.js`

  * HTTP layer that calls service functions

* `test/sessionService.test.js`

  * Jest tests for service behavior using Firestore emulator
