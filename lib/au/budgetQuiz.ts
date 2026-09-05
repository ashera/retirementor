// Budget Quest — per-category "work it out" quizzes. Instead of guessing an annual $
// for a category, the user answers a short SERIES of plain-language multiple-choice
// questions (built from the category's sub-items) and the answers SUM to the figure.
// Amounts are authored per SINGLE household, then scaled for couples by that category's
// own ASFA couple/single ratio (so food & health scale a lot, housing barely does).
// Pure data + helpers — the React flow lives in components/CategoryQuiz.tsx.

import type { EngineConfig } from "./config";
import type { Household } from "./types";

export interface QuizOption {
  label: string;
  sub?: string; // a plain-language descriptor / rough framing
  amt: number; // single-household annual $ this answer contributes
}
export interface QuizQuestion {
  key: string; // the sub-item this question sizes
  bert?: string; // Bert's aside (flavour; drier for essentials)
  q: string;
  opts: QuizOption[];
}

// Every category is a real series of questions (3+, four for leisure). Calibrated so the
// "typical" answers sum near the ASFA Comfortable figure and the lowest near Modest.
export const CATEGORY_QUIZ: Record<string, QuizQuestion[]> = {
  housing: [
    {
      key: "Rates & water",
      q: "Council rates and water — what's the place like?",
      opts: [
        { label: "Small home or unit", sub: "Lower rates, less land", amt: 3_200 },
        { label: "A typical home", sub: "Average suburban block", amt: 3_700 },
        { label: "Big block / premium area", sub: "Higher rates and water", amt: 4_600 },
      ],
    },
    {
      key: "Home & contents insurance",
      q: "Home and contents insurance?",
      opts: [
        { label: "Basic cover", sub: "The essentials", amt: 1_600 },
        { label: "Solid cover", sub: "Home and the good stuff inside", amt: 2_100 },
        { label: "Comprehensive", sub: "Everything, including the extras", amt: 3_000 },
      ],
    },
    {
      key: "Repairs & upkeep",
      bert: "Gardens, gutters, the odd tradie — it all adds up.",
      q: "Repairs, maintenance and upkeep?",
      opts: [
        { label: "Low-maintenance", sub: "Little and rarely", amt: 1_700 },
        { label: "The usual upkeep", sub: "Steady maintenance through the year", amt: 2_200 },
        { label: "Pool, garden, big place", sub: "Plenty to look after", amt: 3_900 },
      ],
    },
  ],
  energy: [
    {
      key: "Electricity",
      q: "The electricity bill?",
      opts: [
        { label: "Frugal, or solar", sub: "Careful, or the panels help", amt: 1_100 },
        { label: "Typical", sub: "Comfortable within reason", amt: 1_350 },
        { label: "Always on", sub: "Never think twice about it", amt: 1_750 },
      ],
    },
    {
      key: "Gas & hot water",
      q: "Gas and hot water?",
      opts: [
        { label: "Minimal, or all-electric", sub: "Little or no gas", amt: 350 },
        { label: "Typical", sub: "Cooking and hot water", amt: 550 },
        { label: "Gas heating too", sub: "Ducted or plenty of it", amt: 950 },
      ],
    },
    {
      key: "Heating & cooling",
      bert: "Be honest — jumpers on, or aircon from October?",
      q: "Heating and cooling — how freely?",
      opts: [
        { label: "Jumpers and fans", sub: "Sparingly", amt: 600 },
        { label: "Comfortable", sub: "On when you need it", amt: 750 },
        { label: "Always just right", sub: "Set and forget, year round", amt: 1_300 },
      ],
    },
  ],
  food: [
    {
      key: "The weekly shop",
      bert: "Be honest about the trolley — I won't tell.",
      q: "The main grocery shop each week?",
      opts: [
        { label: "Careful & budget", sub: "Lists, specials, own brands", amt: 3_900 },
        { label: "Comfortable", sub: "Eat well without counting", amt: 4_600 },
        { label: "We eat very well", sub: "Quality over price", amt: 5_800 },
      ],
    },
    {
      key: "Meat, seafood & deli",
      q: "Meat, seafood and the deli counter?",
      opts: [
        { label: "Keep it simple", sub: "Basics, mince and chicken", amt: 1_200 },
        { label: "A good mix", sub: "Nice cuts, some seafood", amt: 2_000 },
        { label: "The best cuts", sub: "Butcher and fishmonger regular", amt: 3_200 },
      ],
    },
    {
      key: "Fresh produce & extras",
      q: "Fresh fruit, veg and specialty bits?",
      opts: [
        { label: "The basics", sub: "Whatever's on special", amt: 1_000 },
        { label: "Plenty of fresh", sub: "Good fruit and veg weekly", amt: 1_400 },
        { label: "Farmers' market regular", sub: "Quality produce, deli treats", amt: 2_400 },
      ],
    },
  ],
  health: [
    {
      key: "Private cover",
      q: "Private health cover?",
      opts: [
        { label: "Public system for me", sub: "No private cover", amt: 0 },
        { label: "Basic hospital cover", sub: "Peace of mind, no frills", amt: 2_000 },
        { label: "Comprehensive extras", sub: "Hospital + dental, optical, physio", amt: 3_700 },
      ],
    },
    {
      key: "Chemist & scripts",
      q: "Chemist, scripts and everyday health?",
      opts: [
        { label: "Rarely need much", sub: "The odd script", amt: 400 },
        { label: "The usual", sub: "Regular scripts and check-ups", amt: 900 },
        { label: "A fair bit", sub: "Managing a condition or two", amt: 1_800 },
      ],
    },
    {
      key: "Dental, optical & specialists",
      bert: "Teeth and eyes have a way of getting expensive in retirement.",
      q: "Dental, optical and specialists?",
      opts: [
        { label: "Just check-ups", sub: "The occasional visit", amt: 700 },
        { label: "The usual work", sub: "Regular dental and optical", amt: 1_660 },
        { label: "Ongoing treatment", sub: "Implants, specialists, the lot", amt: 3_600 },
      ],
    },
  ],
  transport: [
    {
      key: "The car",
      bert: "A near-new SUV and an old runabout aren't the same budget.",
      q: "The car — rego, insurance and depreciation?",
      opts: [
        { label: "No car — public transport", sub: "Bus, train, the odd taxi", amt: 0 },
        { label: "One older car", sub: "Reliable, paid off", amt: 4_000 },
        { label: "A comfortable car", sub: "Newer, well insured", amt: 6_500 },
        { label: "Near-new, or two cars", sub: "The good stuff, or one each", amt: 9_500 },
      ],
    },
    {
      key: "Fuel & servicing",
      q: "Fuel, servicing and tyres?",
      opts: [
        { label: "Barely drive", sub: "Local trips only", amt: 400 },
        { label: "Here and there", sub: "Normal running around", amt: 1_300 },
        { label: "On the road a lot", sub: "Long drives, road trips", amt: 2_300 },
      ],
    },
    {
      key: "Public transport & rideshare",
      q: "Public transport, taxis and rideshare?",
      opts: [
        { label: "Rarely", sub: "The car does it all", amt: 400 },
        { label: "Now and then", sub: "A few trips a month", amt: 900 },
        { label: "Often", sub: "In and out of town regularly", amt: 2_000 },
      ],
    },
  ],
  household: [
    {
      key: "Phone & internet",
      q: "Phone and internet?",
      opts: [
        { label: "Basic", sub: "A plan that does the job", amt: 900 },
        { label: "Typical", sub: "Decent data, home broadband", amt: 1_500 },
        { label: "Everything connected", sub: "Fast NBN, latest phones", amt: 2_400 },
      ],
    },
    {
      key: "Clothing & footwear",
      q: "Clothes and shoes?",
      opts: [
        { label: "Replace as needed", sub: "Practical, not fussy", amt: 1_500 },
        { label: "A few nice things", sub: "Update the wardrobe each season", amt: 2_400 },
        { label: "I like to look good", sub: "Quality labels, regularly", amt: 4_000 },
      ],
    },
    {
      key: "Household goods & personal care",
      bert: "Haircuts, homewares, the little top-ups — it counts.",
      q: "Household goods and personal care?",
      opts: [
        { label: "Modest", sub: "The essentials, DIY where you can", amt: 2_400 },
        { label: "Comfortable", sub: "The salon, nice homewares", amt: 4_100 },
        { label: "The good life", sub: "Quality everything, help around the house", amt: 6_000 },
      ],
    },
  ],
  leisure: [
    {
      key: "Eating out & takeaway",
      bert: "Be honest — I won't judge the third UberEats of the week.",
      q: "How often do you eat out or order in?",
      opts: [
        { label: "Special occasions only", sub: "Birthdays and the odd Friday", amt: 520 },
        { label: "A weekly treat", sub: "One nice dinner or lunch a week", amt: 2_600 },
        { label: "A few times a week", sub: "Cooking's optional", amt: 6_240 },
        { label: "Why cook?", sub: "Restaurants are my kitchen", amt: 10_400 },
      ],
    },
    {
      key: "A drink or two",
      bert: "Cellar door on the way home counts, you know.",
      q: "And the drinks budget?",
      opts: [
        { label: "I'm right, thanks", sub: "Rarely bother", amt: 0 },
        { label: "A cheeky weekend bottle", sub: "Something nice on Saturdays", amt: 1_040 },
        { label: "Wine o'clock most nights", sub: "A glass with dinner", amt: 2_600 },
        { label: "The cellar needs stocking", sub: "Good drops, regularly", amt: 4_160 },
      ],
    },
    {
      key: "Hobbies & fun",
      bert: "Golf clubs aren't cheap. Neither is a boat.",
      q: "How will you fill the good years?",
      opts: [
        { label: "Free & easy", sub: "Walks, the library, mates, the beach", amt: 520 },
        { label: "A hobby or two", sub: "Classes, the club, a bit of gear", amt: 2_080 },
        { label: "Serious about it", sub: "Golf, sailing, proper kit", amt: 5_200 },
        { label: "Money-no-object passions", sub: "If it's worth doing…", amt: 9_100 },
      ],
    },
    {
      key: "Screens & subscriptions",
      bert: "Yes, all four streaming services count.",
      q: "Streaming, apps and subscriptions?",
      opts: [
        { label: "Just the basics", sub: "One service, maybe the paper", amt: 240 },
        { label: "A couple of streamers", sub: "The usual suspects", amt: 600 },
        { label: "Every service going", sub: "Sport, movies, music, the lot", amt: 1_560 },
      ],
    },
  ],
  travel: [
    {
      key: "Overseas holidays",
      bert: "The world's a big place. How much of it are we seeing?",
      q: "Overseas travel?",
      opts: [
        { label: "Not for me", sub: "Happy closer to home", amt: 0 },
        { label: "A trip every few years", sub: "The occasional big one", amt: 3_000 },
        { label: "An overseas trip most years", sub: "One proper trip abroad", amt: 6_000 },
        { label: "The world's my oyster", sub: "Somewhere new, often", amt: 10_000 },
      ],
    },
    {
      key: "Domestic holidays",
      q: "Holidays here in Australia?",
      opts: [
        { label: "Rarely", sub: "Home's the holiday", amt: 0 },
        { label: "A trip most years", sub: "A week or two away", amt: 1_500 },
        { label: "Several a year", sub: "Regular explorer", amt: 3_500 },
      ],
    },
    {
      key: "Weekends & short breaks",
      q: "Weekends away and short breaks?",
      opts: [
        { label: "Not really", sub: "The big trips are enough", amt: 0 },
        { label: "A few a year", sub: "A long weekend here and there", amt: 1_200 },
        { label: "Any excuse", sub: "Always got one booked", amt: 2_800 },
      ],
    },
  ],
};

/** This category's ASFA couple/single ratio — how much a couple's spend scales. */
export function coupleFactor(categoryKey: string, config: EngineConfig): number {
  const c = config.asfa.breakdown.categories.find((x) => x.key === categoryKey);
  if (!c || c.comfortable.single <= 0) return 1.4;
  return c.comfortable.couple / c.comfortable.single;
}

/** Whether a category has a "work it out" quiz. */
export function hasQuiz(categoryKey: string): boolean {
  return !!CATEGORY_QUIZ[categoryKey];
}

/** The quiz for a category, with option amounts scaled to the household. */
export function quizFor(categoryKey: string, household: Household, config: EngineConfig): QuizQuestion[] {
  const qs = CATEGORY_QUIZ[categoryKey] ?? [];
  const f = household === "couple" ? coupleFactor(categoryKey, config) : 1;
  if (f === 1) return qs;
  return qs.map((q) => ({
    ...q,
    opts: q.opts.map((o) => ({ ...o, amt: o.amt === 0 ? 0 : Math.round((o.amt * f) / 10) * 10 })),
  }));
}
