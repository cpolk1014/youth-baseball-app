// Tips on the loading card, shown only when a load runs long (TIP_DELAY_MS), each long enough to
// read (TIP_EVERY_MS). Short, true, and about Fungo itself, so there's nothing to fact-check.
// Keep each under TIP_MAX characters, and update or drop one when its feature changes.

export const TIP_DELAY_MS = 1500;
export const TIP_EVERY_MS = 5000;
export const TIP_MAX = 90;

type Audience = "all" | "staff" | "parent";

export const TIPS: { text: string; for: Audience }[] = [
  // Everyone
  { for: "all", text: "Press ⌘K (or /) on a computer to jump to any page, game or player." },
  { for: "all", text: "Fungo works with no signal. Your team stays on your phone." },
  {
    for: "all",
    text: "Chatter notifications say which channel a post is in. Tap to go right there.",
  },
  {
    for: "all",
    text: "Turn on Save me from myself in Chatter's Settings and every post asks first.",
  },
  { for: "all", text: "On an iPhone, add Fungo to your Home Screen to get notifications." },
  { for: "all", text: "Every game has one-tap directions to the field. Yes, even Field 7." },
  { for: "all", text: "The forecast for each game shows up on its page about a week out." },
  { for: "all", text: "Tournament weekend? “What time do we play tomorrow?” works it out." },
  { for: "all", text: "Anyone on the team can report tournament scores from the bleachers." },
  { for: "all", text: "The Plays tab has 57 animated plays. Quiz yourself on where to go." },
  { for: "all", text: "Add every practice to your phone's calendar from Practices." },
  { for: "all", text: "Tap the mic in any AI box and just say it." },
  // Coaches and managers
  {
    for: "staff",
    text: "Tap an inning's number on the Field tab to make a mid-inning pitching change.",
  },
  { for: "staff", text: "“Why this lineup?” explains every kid's spots before anyone asks." },
  {
    for: "staff",
    text: "Type a fair-play rule in plain English, like “Jake never catches twice.”",
  },
  { for: "staff", text: "Snap a picture of your schedule and AI adds the games for you." },
  { for: "staff", text: "Import your roster from a screenshot. AI reads the names and numbers." },
  {
    for: "staff",
    text: "Add a GameChanger box score and every kid's line and pitch count fill in.",
  },
  {
    for: "staff",
    text: "Competitive mode builds the batting order from your stats, hot streaks too.",
  },
  { for: "staff", text: "The game day post lands in Chatter on its own: field, time and uniform." },
  { for: "staff", text: "On a big screen, drag one square onto another to swap two kids." },
  { for: "staff", text: "On a keyboard, press A on a game to auto-fill the lineup and U to undo." },
  {
    for: "staff",
    text: "Plan a whole season of practices at once with ✨ Plan practices with AI.",
  },
  { for: "staff", text: "Make a share link on a tournament so other teams see standings too." },
  { for: "staff", text: "Pick a uniform for each game and every family sees what to wear." },
  { for: "staff", text: "Make the batting order a picture in team colors from any game." },
  // Families
  { for: "parent", text: "Tap your player on the Roster to open their page." },
  { for: "parent", text: "Set up your player's walk-up song. The coach approves it." },
  { for: "parent", text: "The Parents channel in Chatter is just the families. No coaches." },
  { for: "parent", text: "Home shows what your family owes the team, and when it's due." },
  {
    for: "parent",
    text: "Pine Tar Productions turns your clip into a highlight with an announcer.",
  },
  {
    for: "parent",
    text: "Log every pitch, lessons and bullpens too, and see when they can pitch again.",
  },
];

/** The tips for someone with this team role (none known yet: just the ones for everyone). */
export function tipsFor(role: string | null | undefined): string[] {
  const staff = role === "owner" || role === "coach" || role === "manager";
  const parent = role === "parent" || role === "treasurer";
  return TIPS.filter(
    (t) => t.for === "all" || (staff && t.for === "staff") || (parent && t.for === "parent"),
  ).map((t) => t.text);
}

/** The nth tip after a starting point, going round the list. */
export function tipAt(tips: string[], start: number, n: number): string {
  return tips.length ? tips[(((start + n) % tips.length) + tips.length) % tips.length]! : "";
}
