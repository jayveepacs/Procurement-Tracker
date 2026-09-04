/* ============================================================
   FIREBASE CONFIG
   ------------------------------------------------------------
   1. Go to https://console.firebase.google.com and create a project.
   2. Add a Web App (</> icon). Firebase shows you a config object.
   3. Paste those values below (they are safe to be public - security
      is enforced by Firestore Security Rules + Auth, not by hiding this).
   4. In the console: enable Authentication > Email/Password,
      and create a Firestore Database (start in production mode).
   5. Paste the rules from firestore.rules into
      Firestore Database > Rules, and Publish.

   Until real values are filled in, the app runs in LOCAL mode
   (browser-only storage) with sample data so you can test the UI.
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAdFFkpr13WTbuUUE7vEABlMO82D5Xz3RM",
  authDomain: "procurement-tracker-63a1e.firebaseapp.com",
  projectId: "procurement-tracker-63a1e",
  storageBucket: "procurement-tracker-63a1e.firebasestorage.app",
  messagingSenderId: "649640199932",
  appId: "1:649640199932:web:352bba4095d5e322fcb979",
  measurementId: "G-RFRHZ5XHPD"
};

// Auto-detect whether real config has been filled in.
const FIREBASE_ENABLED = !String(FIREBASE_CONFIG.apiKey).includes('PASTE');
