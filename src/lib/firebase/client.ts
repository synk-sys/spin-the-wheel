"use client";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";

/** Public web config (safe to ship to browsers; access is enforced by rules and the server). */
export function firebaseWebConfig(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    projectId,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
}

export function firebaseClientApp(): FirebaseApp | null {
  const config = firebaseWebConfig();
  if (!config) return null;
  return getApps().length ? getApp() : initializeApp(config);
}

/** Projector uses a Firestore listener when configured, otherwise polls the public API. */
export function displaySyncMode(): "firestore" | "poll" {
  if (process.env.NEXT_PUBLIC_DISPLAY_SYNC === "poll") return "poll";
  return firebaseWebConfig() ? "firestore" : "poll";
}
