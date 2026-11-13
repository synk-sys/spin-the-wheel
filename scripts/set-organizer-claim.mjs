#!/usr/bin/env node
/**
 * Grants (or revokes) the `organizer` custom claim on a Firebase Auth user.
 * An alternative to listing emails in ORGANIZER_EMAILS.
 *
 * Usage (with Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/set-organizer-claim.mjs --project <project-id> organizer@yourdomain.com
 *   node scripts/set-organizer-claim.mjs --project <project-id> --revoke someone@yourdomain.com
 *
 * The person must have signed in once (so the user exists) and must sign in
 * again afterwards for the claim to take effect.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const projectId = projectIdx >= 0 ? args[projectIdx + 1] : process.env.FIREBASE_PROJECT_ID;
const revoke = args.includes("--revoke");
const email = args.filter((a, i) => !a.startsWith("--") && i !== projectIdx + 1).pop();

if (!projectId || !email) {
  console.error("Usage: node scripts/set-organizer-claim.mjs --project <project-id> [--revoke] <email>");
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.organizer;
else claims.organizer = true;
await auth.setCustomUserClaims(user.uid, claims);
if (revoke) await auth.revokeRefreshTokens(user.uid);
console.log(`${revoke ? "Revoked" : "Granted"} organizer claim for ${email} (${user.uid}).`);
