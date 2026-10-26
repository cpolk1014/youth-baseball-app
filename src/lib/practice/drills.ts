// Starter drill library for youth baseball practices. Coaches can also type their own.

export interface Drill {
  title: string;
  minutes: number;
  description: string;
}

export const PRACTICE_FOCUSES = [
  "Hitting",
  "Infield",
  "Outfield",
  "Throwing",
  "Baserunning",
  "Pitching & catching",
  "Team defense",
  "Scrimmage",
] as const;

export const DRILL_LIBRARY: { category: string; drills: Drill[] }[] = [
  {
    category: "Warm-up",
    drills: [
      {
        title: "Dynamic warm-up",
        minutes: 10,
        description: "Jog, high knees, butt kicks, side shuffles, arm circles.",
      },
      {
        title: "Partner catch",
        minutes: 10,
        description: "Start close, step back every few throws. Focus on four-seam grip.",
      },
      {
        title: "Long toss",
        minutes: 10,
        description:
          "Gradually stretch distance with arcing throws, then bring it back in on a line.",
      },
    ],
  },
  {
    category: "Fielding",
    drills: [
      {
        title: "Ground balls: ready position",
        minutes: 15,
        description: "Wide base, glove out front, funnel to the belly.",
      },
      {
        title: "Short hops",
        minutes: 10,
        description: "Partners throw short hops from 15 feet; soft hands, glove leads.",
      },
      {
        title: "Fly balls with a call",
        minutes: 15,
        description: "Call 'Ball! Ball! Ball!', catch above the throwing shoulder.",
      },
      {
        title: "Relay and cutoff",
        minutes: 15,
        description: "Outfield to cutoff to base; hit the cutoff's chest.",
      },
      {
        title: "Bucket ground balls",
        minutes: 10,
        description: "Field, shuffle, throw to a bucket or net. Lots of reps fast.",
      },
    ],
  },
  {
    category: "Hitting",
    drills: [
      {
        title: "Tee work",
        minutes: 15,
        description: "Balanced stance, short to the ball, finish high. Rotate tee locations.",
      },
      {
        title: "Soft toss",
        minutes: 15,
        description: "Side toss into a net; watch the ball onto the barrel.",
      },
      {
        title: "Live batting practice",
        minutes: 25,
        description: "Coach pitch or machine; 6–8 swings, then run out the last one.",
      },
      {
        title: "Bunting",
        minutes: 10,
        description: "Square early, bat at the top of the zone, catch the ball with the bat.",
      },
    ],
  },
  {
    category: "Baserunning",
    drills: [
      {
        title: "Run through first",
        minutes: 10,
        description: "Hit the front of the bag, look right for an overthrow.",
      },
      {
        title: "Rounding bases",
        minutes: 10,
        description: "Banana turn, hit the inside corner, eyes on the coach.",
      },
      {
        title: "Leads and reads",
        minutes: 10,
        description: "Secondary leads; go on a ball in the dirt.",
      },
    ],
  },
  {
    category: "Pitching & catching",
    drills: [
      {
        title: "Pitcher flat ground",
        minutes: 15,
        description: "Balance point, stride to target, finish over the front leg.",
      },
      {
        title: "Catcher blocking",
        minutes: 10,
        description: "Drop to knees, chest over the ball, glove covers the five-hole.",
      },
      {
        title: "Catcher framing",
        minutes: 10,
        description: "Receive with a quiet glove; pull pitches back to the zone.",
      },
    ],
  },
  {
    category: "Team & fun",
    drills: [
      {
        title: "Situations",
        minutes: 20,
        description: "Coach calls outs and runners; defense talks it through, then plays it.",
      },
      {
        title: "Pickle (rundown)",
        minutes: 10,
        description: "Runner in a rundown; fielders run the runner back and tag with few throws.",
      },
      {
        title: "Around the horn",
        minutes: 5,
        description: "Fast throws base to base; beat the clock.",
      },
      {
        title: "Scrimmage",
        minutes: 30,
        description: "Game-speed innings; coaches stop play to teach.",
      },
      {
        title: "Cool-down and huddle",
        minutes: 5,
        description: "Light stretch, shout-outs, what's next.",
      },
    ],
  },
];
