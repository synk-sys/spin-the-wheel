import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Initializes the Firebase Admin SDK.
 *
 * On Firebase App Hosting (Cloud Run) Application Default Credentials are used
 * automatically. Locally, either set GOOGLE_APPLICATION_CREDENTIALS to a
 * service-account key file or provide FIREBASE_SERVICE_ACCOUNT_JSON.
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    return initializeApp({ credential: cert(JSON.parse(json)), projectId });
  }
  return initializeApp(projectId ? { projectId } : undefined);
}

let db: Firestore | null = null;

export function adminDb(): Firestore {
  if (!db) {
    db = getFirestore(adminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}
