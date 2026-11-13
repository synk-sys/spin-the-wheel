# Troubleshooting

## Signing in

| Symptom | Cause / fix |
| --- | --- |
| "…is not on the organizer list" | Add the email to the `organizer-emails` secret (then redeploy or roll out), or grant the custom claim with `scripts/set-organizer-claim.mjs`. The email must be a verified Google account. |
| "Firebase is not configured" on `/login` | The web config is missing. On App Hosting, link the backend to a Firebase web app. Locally, set `NEXT_PUBLIC_FIREBASE_*` in `.env.local`. |
| Google popup closes immediately / `auth/unauthorized-domain` | Add the site's domain under Firebase Auth → Settings → Authorized domains. |
| Popup blocked | Allow popups for the site, then click **Sign in with Google** again. |
| "Please sign in again" right after signing in | The server requires a sign-in from the last 5 minutes. Check that the laptop clock is correct and try again. |
| Signed out unexpectedly | Sessions last 8 hours. Signing out elsewhere revokes all sessions. Sign in again. |
| Sign-in fails on the deployed site with a server error | The App Hosting service account is missing **Firebase Authentication Admin**. See README → Deploying. |

## Raffle control

| Symptom | Cause / fix |
| --- | --- |
| **Start spin** is disabled | The status line under the button says why: paused, no prize selected, prize used up, no eligible participants, or the wheel is still spinning. |
| "The wheel is still spinning." | A new spin can start once the current animation ends (about 7 seconds). |
| "Another draw or import is in progress." | Another organizer is drawing or importing. Wait a few seconds. Abandoned locks expire after 30 seconds (2 minutes for imports). |
| "Participants changed while drawing…" | Someone edited eligibility during the draw and the server retried 3 times. No winner was recorded. Spin again. |
| "All N of … have been drawn." | That prize is used up. Click **Next prize**, or raise its quantity on the Prizes page. |
| Can't change a winner's eligibility | Void their draw first. Winners are protected so history stays consistent. |
| Can't delete a prize | Prizes with draw history can't be deleted. Mark them awarded, or edit them instead. |
| "Synced" turns into "Connection problem — retrying" | The organizer laptop lost the server. It keeps retrying. Check the network. |

## Projector

| Symptom | Cause / fix |
| --- | --- |
| Status pill says **Reconnecting…** or **Offline** | It reconnects automatically and shows the latest state. Refresh if it stays stuck. |
| Projector shows the wrong raffle | Production is `/display`. Demo is `/display?env=demo` and is labeled **DEMO MODE**. |
| No sound | Click **Click to enable sound** once (browsers need a click), and make sure **Sound on** is set in Control. Sound is optional. |
| Layout too small or large | The stage scales to fit the window. Use **Fullscreen**, set the display to 1920×1080, and keep browser zoom at 100%. |
| Animation is minimal | The projector laptop has "reduce motion" turned on in OS accessibility settings. The spin is shortened on purpose. Turn the setting off for the full animation. |

## Importing CSV

| Symptom | Cause / fix |
| --- | --- |
| "This exact file was already imported" | Duplicate imports are blocked on purpose. To add more people, import a file that contains only the new rows. |
| Every row shows "already imported" | Those attendee IDs, emails, or ticket numbers already exist. |
| Names look garbled | Save the CSV as **UTF-8** (Excel: "CSV UTF-8"). |
| Columns are wrong | Fix the mapping in step 2 of the importer. |
| Two people share an email | Duplicates are excluded by default. Tick **Use** on the second row to keep it deliberately. |

## Server / deployment

| Symptom | Cause / fix |
| --- | --- |
| `PERMISSION_DENIED` from Firestore in server logs | Grant **Cloud Datastore User** to the App Hosting service account. |
| "DATA_BACKEND=firestore is required in production" | Set `DATA_BACKEND=firestore` (already in `apphosting.yaml`). |
| Projector works locally but not in Firestore mode | Deploy the rules (`firebase deploy --only firestore`). They allow public reads of `publicDisplay/{env}` only. |
| Build fails on App Hosting | Check the build logs in the console. Node.js 20.9+ is required. |

Check server logs in Firebase console → App Hosting → your backend → Logs. They're also in Cloud Logging.
