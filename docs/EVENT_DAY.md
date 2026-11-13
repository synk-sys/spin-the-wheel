# Event-day operations guide

This guide is for the organizers running the raffle at the DevFest Toronto 2026 closing ceremony.

**Roles:**

- **Operator**: runs `/admin/control` on the organizer laptop.
- **Host**: on stage, reads out names.
- **Prize desk**: hands out prizes and confirms claims.

One person can do more than one role.

---

## One week before

- [ ] Every organizer who will operate the raffle can sign in at `/login`. That means they're in `ORGANIZER_EMAILS` or have the `organizer` claim.
- [ ] You did a full practice run in **Demo** mode: spin, confirm, claim, void and redraw, next prize, pause/resume, and **Reset demo**.
- [ ] Prizes are entered in **Production** (Prizes page) with correct quantities and draw order, smallest prize first and Grand Prize last.
- [ ] You know where the attendee export comes from (ticketing system → CSV) and who will produce the final file.

## The day before / morning of

- [ ] Import the final attendee CSV into **Production**: switch the header toggle to Production → Participants → Import CSV.
  - Review the report: invalid rows, duplicates in the file, already imported, shared names.
  - Fix or exclude rows as needed, then confirm.
  - Check the total on the Participants page against the ticketing system.
- [ ] Mark no-shows or staff as **Ineligible** if your rules require it. You can bulk-select them.
- [ ] Export the participant list (Participants → Export) as a backup.

## One hour before

- [ ] Connect the **projector laptop**. Open `https://<your-app>/display` (production) in Chrome and click **Fullscreen**. If you want sound, click **Click to enable sound** once.
- [ ] Check that the status pill in the bottom-right says **Live**.
- [ ] On the **organizer laptop**, open `/admin/control` with the header toggle on **Production** (red banner).
- [ ] Select the first prize. The projector should show it within a second or two.
- [ ] Turn off sleep and screen savers on both laptops, plug in power, and use a wired network if you can.
- [ ] Optional: **Pause raffle** until the ceremony starts. The projector then shows "Short intermission".

## Running the raffle

For each prize:

1. Check the selected **Current prize** and its remaining quantity.
2. Click **Start spin** once. The button disables immediately, so double-clicks are safe.
3. The projector spins for about 7 seconds, then shows the winner's name, ticket number, prize, and confetti.
4. The host reads the name and asks the winner to come up.
5. When the winner is confirmed in the room, click **Confirm winner**.
6. When they've received the prize, click **Mark prize claimed**. The prize desk can also do this later from History.
7. Spin again for the next unit of the same prize, or click **Next prize** when it's used up.

When every prize has been drawn, the projector shows "All prizes awarded!".

### If a winner isn't present

1. Click **Mark absent**. This is optional, but it records what happened.
2. Click **Void & redraw**, enter a reason (for example "Not present after three calls"), and confirm.
3. The prize goes back to the pool, and the voided person stays excluded. Spin again.
4. If they show up later and your rules allow it, restore them from the Participants page using **Restore** on their row.

### If something goes wrong

| Situation | What to do |
| --- | --- |
| Clicked spin for the wrong prize | Let the spin finish, then **Void & redraw** with reason "Wrong prize selected". Select the right prize and spin. |
| Projector shows "Reconnecting…" | Usually fixes itself. If it doesn't within about 10 seconds, refresh the projector page. It recovers the current state and won't replay old spins. |
| Projector laptop crashed | Open `/display` on any other device. Nothing is stored on the projector. |
| Organizer laptop crashed | Sign in on another laptop. All state is on the server. A spin that was already committed stays committed, and retrying won't create a second one. |
| "Another draw or import is in progress" | Wait a few seconds. A stuck lock expires on its own after 30 seconds. |
| Need a break | **Pause raffle**. Spinning is blocked and the projector shows an intermission screen. **Resume raffle** when ready. |
| Need the wheel back on screen without spinning | **Back to wheel**. |
| Internet drops | The projector shows "Offline — will resync". Spins can't start without the server. When the connection returns, everything resyncs. |

## After the ceremony

- [ ] History → **Export CSV** gives the complete winner report: every draw with status, timestamps, organizer, pool size, and void reasons.
- [ ] History → **Print report** if you need paper.
- [ ] Follow up with unclaimed winners. The History "Claim" column shows who still has to collect.
- [ ] Keep the export with your event records. The audit log (History → Audit log) has the full trail.

## Ground rules worth announcing

- Every eligible attendee has exactly one entry, and winners can't win twice.
- Winners are chosen by a secure random draw on the server. The wheel is for show.
- You must be present (or meet whatever claim rule you choose) to receive a prize.
