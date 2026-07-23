# Listpad — manual Firebase setup

Everything code/config-shaped (rules, indexes, functions, client SDK
wiring) is already written and committed. The steps below are the ones
that need a human at a browser doing interactive OAuth / account and
billing decisions — no coding agent can do these on your behalf.

## 1. Install the Firebase CLI (if you don't have it)

```sh
npm install -g firebase-tools
```

## 2. Log in

```sh
firebase login
```

Opens a browser for Google OAuth.

## 3. Create a Firebase project

Either via the [Firebase console](https://console.firebase.google.com/)
("Add project"), or from the CLI:

```sh
firebase projects:create --display-name "Listpad"
```

Note the **project id** it gives you (e.g. `listpad-abc123`) — you'll need
it in step 7.

## 4. Enable Email/Password authentication

In the Firebase console: **Build -> Authentication -> Get started ->
Sign-in method -> Email/Password -> Enable**.

## 5. Enable Cloud Storage

Item photos are uploaded to a Storage bucket. In the console: **Build ->
Storage -> Get started**. Pick a location (this is permanent) and accept
the default rules for now — `storage.rules` in this repo replaces them at
deploy time (step 10).

Note the bucket name it shows (`your-project.firebasestorage.app`) — it's
the `VITE_FIREBASE_STORAGE_BUCKET` value in step 8, and also appears in
the web app config there.

## 6. Upgrade to the Blaze (pay-as-you-go) plan

Cloud Functions require it. In the console: **bottom-left "Upgrade" /
Project settings -> Usage and billing -> Modify plan -> Blaze**. Usage
for an app this size should stay within the free-tier quotas that Blaze
still includes — you're billed only if you exceed them.

## 7. Point this repo at your project

Edit `.firebaserc` and replace the placeholder project id:

```json
{
  "projects": {
    "default": "YOUR-PROJECT-ID-HERE"
  }
}
```

## 8. Register a Web app and get its config

Console: **Project settings -> General -> Your apps -> Add app -> Web
(`</>`)**. Give it any nickname (Firebase Hosting setup can be skipped
here — `firebase.json` already configures Hosting). Copy the resulting
`firebaseConfig` values into a real `.env` file:

```sh
cp .env.example .env
```

Then fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` from that
config object. `.env` is gitignored — never commit it.

## 9. Install functions dependencies (if not already done)

```sh
cd functions
npm install
cd ..
```

## 10. Deploy rules, indexes, and functions

Once steps 1-7 are done (and functions/ has been fleshed out /
reviewed):

```sh
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

`storage` deploys `storage.rules`, which locks the bucket down to signed-in
users and caps uploads at 1 MB — read the header comment in that file for
what it can and can't enforce. Deploying it replaces the console's default
rules, which expire after 30 days.

Add `,hosting` once `npm run build` produces a `dist/` you're ready to
publish:

```sh
npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

## Local development (no live project needed for this part)

The emulator suite (Auth + Firestore + Storage + Functions + Hosting UI) runs
entirely locally once `firebase.json` is in place — you still need a
project id in `.firebaserc` for the emulators to bind to, but nothing is
deployed:

```sh
firebase emulators:start
```

The emulator UI defaults to http://localhost:4000 (Auth on 9099,
Firestore on 8080, Storage on 9199, Functions on 5001, Hosting on 5000 —
see `firebase.json`). In another terminal, run the Vite dev server as
usual (`npm run dev`); wiring the client SDK to talk to the emulators
instead of production (via `connectAuthEmulator` /
`connectFirestoreEmulator` / `connectStorageEmulator` /
`connectFunctionsEmulator` in `src/firebase/config.ts`, typically gated
behind `import.meta.env.DEV`) is left to whoever does the integration
pass, since Agent 1's `config.ts` only wires up production `initializeApp`
per the task spec.
