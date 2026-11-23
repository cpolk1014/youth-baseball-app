// The demo club: someone trying Fungo without an account is signed in as a guest (Supabase
// anonymous sign-in) with their own copy of the made-up Bayou Baseball Club, gone after two
// days (supabase/migrations/20261228000000_demo_club.sql). AI and payments are off for guests.

/** What a guest sees when they reach for an AI feature. */
export const DEMO_AI_OFF =
  "AI is off in the demo club. Start your free 14-day trial to try it with your own team.";

/** What a guest sees when they reach for a payment. */
export const DEMO_PAY_OFF =
  "This is the demo club, so nothing here can be bought. Start your real club to buy codes.";

/** Where "Start my real club" goes: sign in with an email, then straight to the club page. */
export const REAL_CLUB_HREF = "/login?next=/club";

/** Is this signed-in user a guest? Supabase marks anonymous sign-ins on the user and token. */
export function isGuest(user: { is_anonymous?: boolean } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

/** Demo Chatter pictures live in the app's public files, not the private photo bucket. */
const DEMO_PHOTO = /^demo\/([a-z0-9-]+\.jpg)$/;

/** The public link to a demo club's Chatter picture ("demo/scoreboard.jpg"), else null. */
export function demoPhotoUrl(path: string): string | null {
  const m = DEMO_PHOTO.exec(path);
  return m ? `/demo-chatter/${m[1]}` : null;
}
