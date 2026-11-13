import type { NextConfig } from "next";

/**
 * Firebase App Hosting provides the web app config as FIREBASE_WEBAPP_CONFIG
 * at build time. Expose it as NEXT_PUBLIC_* so the browser can use Google
 * sign-in and the projector's Firestore listener without duplicating config.
 * Explicit NEXT_PUBLIC_FIREBASE_* values always win.
 */
function firebasePublicEnv(): Record<string, string> {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return {};
  try {
    const c = JSON.parse(raw) as Record<string, string>;
    const pick = (name: string, value?: string) => (process.env[name] || value ? { [name]: process.env[name] || value! } : {});
    return {
      ...pick("NEXT_PUBLIC_FIREBASE_API_KEY", c.apiKey),
      ...pick("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", c.authDomain),
      ...pick("NEXT_PUBLIC_FIREBASE_PROJECT_ID", c.projectId),
      ...pick("NEXT_PUBLIC_FIREBASE_APP_ID", c.appId),
      ...pick("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", c.messagingSenderId),
      ...pick("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", c.storageBucket),
    };
  } catch {
    return {};
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: firebasePublicEnv(),
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
