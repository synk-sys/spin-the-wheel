import type { ParticipantInput, PrizeInput } from "../domain/types";

const FIRST = [
  "Alex", "Jordan", "Sam", "Taylor", "Morgan", "Riley", "Casey", "Jamie", "Avery", "Quinn",
  "Priya", "Arjun", "Mei", "Wei", "Hana", "Kenji", "Amara", "Kwame", "Zara", "Omar",
  "Lucia", "Mateo", "Sofia", "Diego", "Noah", "Emma", "Liam", "Olivia", "Aisha", "Yusuf",
  "Elena", "Ivan", "Nadia", "Tomas", "Ingrid", "Lars", "Fatima", "Hassan", "Chloe", "Marcus",
];
const LAST = [
  "Johnson", "Lee", "Patel", "Nguyen", "Chen", "Singh", "Garcia", "Martin", "Brown", "Wilson",
  "Kim", "Okafor", "Mensah", "Haddad", "Rossi", "Silva", "Kowalski", "Novak", "Tanaka", "Sato",
  "Dubois", "Moreau", "Ahmed", "Khan", "Fernandez", "Lopez", "Murphy", "O'Brien", "Campbell", "Tremblay",
];
const COMPANIES = ["Maple Labs", "Northwind Cloud", "Lakeshore AI", "CN Tower Devs", "Pixel Forge", "Queen St. Studio", "Fictional Corp", null, null, null];

/**
 * Generates fictional attendees deterministically (no randomness needed —
 * demo data never influences the fairness of real draws). Includes a few
 * intentionally shared names to exercise the ticket-number disambiguation.
 */
export function generateDemoAttendees(count = 300): ParticipantInput[] {
  const out: ParticipantInput[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 11 + Math.floor(i / FIRST.length)) % LAST.length];
    const n = String(i + 1).padStart(3, "0");
    out.push({
      attendeeId: `DEMO-${n}`,
      // Rows 51, 148 and 245 deliberately reuse an earlier attendee's name.
      name: i % 97 === 50 ? out[i - 50].name : `${first} ${last}`,
      email: `demo.attendee${n}@example.com`,
      ticketNumber: `DF26-${n}`,
      company: COMPANIES[i % COMPANIES.length],
    });
  }
  return out;
}

/**
 * Default prize rounds: 3 winners in total, one per prize, drawn in this
 * order. Used for the demo and pre-created in production on first setup.
 * Organizers can rename, edit, add or remove prizes on the Prizes page.
 */
export const DEFAULT_PRIZES: PrizeInput[] = [
  { name: "DevFest Swag Pack", description: "T-shirt, stickers, and a water bottle", imageUrl: null, quantity: 1 },
  { name: "Gift Card", description: "$100 gift card", imageUrl: null, quantity: 1 },
  { name: "Grand Prize", description: "The big one — announced on stage", imageUrl: null, quantity: 1 },
];
