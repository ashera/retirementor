// Budget Quest — per-category "work it out" quizzes. Instead of guessing an annual $
// for a category, the user answers a short series of plain-language multiple-choice
// questions (built from the category's sub-items) and the answers SUM to the figure.
// Amounts are authored per SINGLE household, then scaled for couples by that category's
// own ASFA couple/single ratio (so food & health scale a lot, housing barely does).
// Pure data + helpers — the React flow lives in components/CategoryQuiz.tsx.

import type { EngineConfig } from "./config";
import type { Household } from "./types";

export interface QuizOption {
  label: string;
  sub?: string; // a plain-language descriptor / rough weekly framing
  amt: number; // single-household annual $ this answer contributes
}
export interface QuizQuestion {
  key: string; // the sub-item this question sizes
  bert?: string; // Bert's aside (flavour; drier for essentials)
  q: string;
  opts: QuizOption[];
}

// Discretionary categories get more (and wittier) questions; essentials are shorter
// and practical — forcing wit onto "council rates" helps no one.
export const CATEGORY_QUIZ: Record<string, QuizQuestion[]> = {
  housing: [
    {
      key: "Running costs",
      q: "Your home's running costs — rates, water, insurance and upkeep (mortgage or rent aside)?",
      opts: [
        { label: "Compact & low-maintenance", sub: "Unit or small home, few surprises", amt: 6_800 },
        { label: "A typical home", sub: "The usual rates, insurance and repairs", amt: 8_000 },
        { label: "Big place, pool, high rates", sub: "More house, more upkeep", amt: 11_500 },
      ],
    },
  ],
  energy: [
    {
      key: "Power",
      q: "Power bills — how do you run the place?",
      opts: [
        { label: "Frugal, or solar", sub: "Jumpers on before the heater", amt: 2_000 },
        { label: "Typical", sub: "Comfortable, within reason", amt: 2_650 },
        { label: "Always comfy", sub: "Heating and cooling on when wanted", amt: 3_600 },
      ],
    },
  ],
  food: [
    {
      key: "Groceries",
      bert: "The weekly shop — be honest about the trolley.",
      q: "The weekly grocery shop?",
      opts: [
        { label: "Careful & budget", sub: "~$100/wk, specials and lists", amt: 5_200 },
        { label: "Comfortable", sub: "~$120/wk, eat well without counting", amt: 6_300 },
        { label: "We eat well", sub: "~$160/wk, quality over price", amt: 8_300 },
      ],
    },
    {
      key: "Fresh & specialty",
      q: "Butcher, deli and specialty food on top?",
      opts: [
        { label: "Not really", sub: "The supermarket does it all", amt: 900 },
        { label: "A bit", sub: "Good bread, a nice cut now and then", amt: 1_600 },
        { label: "Love good produce", sub: "Farmers' market regular", amt: 3_000 },
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
      key: "Out-of-pocket",
      q: "Chemist, dental and specialists?",
      opts: [
        { label: "Rarely need much", sub: "The odd script", amt: 1_100 },
        { label: "The usual scripts & check-ups", sub: "Regular but routine", amt: 2_600 },
        { label: "Ongoing appointments", sub: "Managing a condition or two", amt: 4_500 },
      ],
    },
  ],
  transport: [
    {
      key: "The car",
      bert: "A near-new car and a boat aren't the same budget, funnily enough.",
      q: "Getting around — the car?",
      opts: [
        { label: "No car — public transport", sub: "Bus, train, the occasional taxi", amt: 1_500 },
        { label: "One modest car", sub: "Older, reliable, paid off", amt: 5_000 },
        { label: "A comfortable car", sub: "Newer, serviced, well insured", amt: 7_500 },
        { label: "Near-new, or two cars", sub: "The good stuff, or one each", amt: 10_500 },
      ],
    },
    {
      key: "Getting around",
      q: "Public transport, taxis and rideshare on top?",
      opts: [
        { label: "Barely", sub: "The car does everything", amt: 500 },
        { label: "Here & there", sub: "A few trips a month", amt: 1_900 },
        { label: "Regularly", sub: "In and out of town often", amt: 3_500 },
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
      key: "Goods, clothing & personal care",
      q: "Clothes, household bits and personal care?",
      opts: [
        { label: "Modest", sub: "Replace as needed", amt: 4_000 },
        { label: "Comfortable", sub: "A few nice things each year", amt: 6_500 },
        { label: "I like nice things", sub: "Quality wardrobe, the salon, good homewares", amt: 9_500 },
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
      key: "Big holidays",
      bert: "The world's a big place. How much of it are we seeing?",
      q: "A big holiday, how often?",
      opts: [
        { label: "Rarely — happy at home", sub: "Home's the holiday", amt: 0 },
        { label: "A local getaway most years", sub: "Somewhere in Australia", amt: 2_500 },
        { label: "An overseas trip most years", sub: "One proper trip abroad", amt: 6_000 },
        { label: "Several trips a year", sub: "Always packing a bag", amt: 12_000 },
      ],
    },
    {
      key: "Weekends & short breaks",
      q: "Weekends away and short breaks?",
      opts: [
        { label: "Not really", sub: "The big trip's enough", amt: 0 },
        { label: "A couple a year", sub: "A long weekend here and there", amt: 1_500 },
        { label: "Often — any excuse", sub: "Regular escapes", amt: 3_500 },
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
