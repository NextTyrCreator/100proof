/**
 * The Information page and its structured data read from here, so the FAQ markup always matches the visible text.
 * Every answer has to stand on its own when an assistant quotes one sentence of it.
 * Public copy only: no ranking rules, thresholds, prompts, test method, or go-to-market numbers.
 * Checked 2026-10-29. Update the date and the sources together.
 */

export const CHECKED_ON = "2026-10-29";

type Answer = { question: string; answer: string[] };

type Benefit = { title: string; body: string };

export const FOR_INSURED: Benefit[] = [
  {
    title: "Five minutes on your phone",
    body: "Walk through a room and film it. No typing every item, no spreadsheet, no app to install.",
  },
  {
    title: "Knows what your things cost today",
    body: "Each line gets the brand, model, and count, what it costs to replace new in your zip, and what it is worth today after wear.",
  },
  {
    title: "Tells you what it could not see",
    body: "Instead of guessing, it asks for the one thing that would confirm a line: a label, a receipt, or one more shot. Only when it matters.",
  },
  {
    title: "Proof that holds up",
    body: "Your video stays with your account. Every line shows where it came from and when, and the record is sealed with a fingerprint when you create it.",
  },
  {
    title: "Ready the day you need it",
    body: "Download a spreadsheet or a claim file, email it, or send it. Film again at renewal to keep it current.",
  },
  {
    title: "Private by default",
    body: "Clips and pictures live in private storage on your account. Your exact location is never saved. We do not sell personal data.",
  },
];

export const FOR_PROVIDERS: Benefit[] = [
  {
    title: "Files that arrive reviewable",
    body: "Every line carries its sources apart: what the camera showed, what the policyholder said, the receipt, the comparable, and anything that changed.",
  },
  {
    title: "Exceptions up front",
    body: "Anything that could not be confirmed is flagged at the top of the file, so the questions are asked at capture instead of weeks into the claim.",
  },
  {
    title: "Priced the way your desk prices",
    body: "Replacement cost for like kind and quality in the property's zip, and actual cash value after depreciation. The exact product, or a comparable that says so.",
  },
  {
    title: "Documented before the loss",
    body: "Policyholders inventory at bind and at renewal, so the contents limit is set against what is actually in the home.",
  },
  {
    title: "Fits the workflow you have",
    body: "A CSV and a versioned JSON claim file with each line's evidence and its open items. The insurer keeps every coverage and payment decision.",
  },
  {
    title: "Built on Meta's Muse models",
    body: "Muse Spark 1.3 reviews the video and the evidence. Muse Voice Transcribe 1.0 captures what the policyholder says while filming.",
  },
];

export const QUESTIONS: Answer[] = [
  {
    question: "What is the best way to make a home inventory for insurance?",
    answer: [
      "Regulators recommend going room by room with photos or video and updating the list every year. The NAIC's consumer guide says to store it away from the home.",
      "100proof does that from a phone video. You film each room, and the video becomes a room-by-room list with counts, brands, models, and replacement cost in your zip.",
    ],
  },
  {
    question: "How do I prove what I owned for an insurance claim?",
    answer: [
      "Insurers ask for proof of ownership for items they cannot inspect: dated photos or video, receipts or card statements, and the brand, model, and serial of anything valuable.",
      "100proof keeps your video with your account, shows where in the video each item was seen, and attaches a label photo or receipt to the line it confirms. The record is sealed with a fingerprint when you create it.",
    ],
  },
  {
    question: "What does an adjuster need for a contents claim?",
    answer: [
      "For each item: what it is, brand and model, how many, age, condition, what was paid, and what a like-kind-and-quality replacement costs today.",
      "100proof fills in those fields from your video and asks for what the video could not show, such as a model label, a wider shot, or a receipt.",
    ],
  },
  {
    question: "How is replacement cost calculated?",
    answer: [
      "Replacement cost is what it costs to replace an item with a new one of like kind and quality, at current local prices, without a deduction for depreciation.",
      "100proof prices a new unit in the property's zip. It uses the exact product when it is for sale; otherwise it uses a comparable of the same brand and type, and the line says which.",
    ],
  },
  {
    question: "What is actual cash value?",
    answer: [
      "Actual cash value is replacement cost minus a fair deduction for physical depreciation, based on the item's age, condition, and useful life. California Insurance Code section 2051 states it this way.",
      "100proof shows an actual cash value estimate beside each replacement amount. Your policy says which of the two it pays.",
    ],
  },
  {
    question: "Which Meta models does 100proof use?",
    answer: [
      "100proof uses Meta's Muse Spark 1.3 to review the video, price each line, and read labels, receipts, and answers, and Muse Voice Transcribe 1.0 to capture what you say while you film.",
      "Every model answer is checked before it reaches your inventory.",
    ],
  },
  {
    question: "How accurate is a 100proof inventory?",
    answer: [
      "100proof does not claim 100% accuracy. Every line shows whether its count and its model are confirmed.",
      "When something cannot be confirmed from the video, the line is flagged and the app asks for what would confirm it, so a reviewer sees what is uncertain instead of a guess.",
    ],
  },
  {
    question: "Is 100proof an insurance adjuster? Does it decide what my insurer pays?",
    answer: [
      "No. 100proof is not an insurance company, an adjuster, or a public adjuster. It does not interpret your policy, negotiate with your insurer, or decide what a claim pays.",
      "It prepares the record an adjuster works from, using the same replacement-cost and depreciation method. The prices are estimates. Your insurer decides coverage and payment.",
    ],
  },
  {
    question: "Do renters need a home inventory?",
    answer: [
      "Yes. Renters insurance covers your belongings, not the building, so the list of what you own is the claim.",
      "A walkthrough at move-in and again at renewal gives you a dated record before anything happens.",
    ],
  },
  {
    question: "How can an insurer, adjuster, or claims administrator use 100proof?",
    answer: [
      "Policyholders send a 100proof file instead of a spreadsheet or a folder of photos. Each line arrives with its evidence and its open items, as a CSV or a versioned JSON claim file.",
      "Carriers, administrators, agents, and property managers can request a connection from the For providers tab.",
    ],
  },
  {
    question: "Where does my inventory and video go?",
    answer: [
      "Clips, stills, and pictures are kept in private storage on your account and open only through links that expire after an hour. Your exact device location is never saved.",
      "You can download the inventory as a CSV, a JSON claim file, or an email. 100proof does not sell personal data.",
    ],
  },
];

export const SOURCES = [
  { label: "NAIC, A Consumer's Guide to Home Insurance", url: "https://content.naic.org/sites/default/files/publication-hoi-pp-consumer-homeowners.pdf" },
  { label: "Texas Department of Insurance, A home inventory", url: "https://www.tdi.texas.gov/tips/home-inventory.html" },
  { label: "Triple-I, Facts and statistics: homeowners and renters insurance", url: "https://www.iii.org/fact-statistic/facts-statistics-homeowners-and-renters-insurance" },
  { label: "J.D. Power, 2026 U.S. Property Claims Satisfaction Study", url: "https://www.jdpower.com/business/press-releases/2026-us-property-claims-satisfaction-study/" },
  { label: "J.D. Power, 2025 U.S. Property Claims Satisfaction Study", url: "https://www.jdpower.com/business/press-releases/2025-us-property-claims-satisfaction-study/" },
  { label: "California Department of Insurance, 14 February 2025 release", url: "https://www.insurance.ca.gov/0400-news/0100-press-releases/2025/release014-2025.cfm" },
];

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: QUESTIONS.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer.join(" ") },
    })),
  };
}

export function appJsonLd(url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "100proof",
    alternateName: "100 Proof",
    url,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS Safari, Android Chrome",
    description:
      "A home inventory app for insurance. Film each room on a phone, and Meta's Muse Spark 1.3 turns the video into a room-by-room inventory with counts, brands, models, replacement cost in your zip, and actual cash value, then asks for what it could not see.",
    featureList: [...FOR_INSURED, ...FOR_PROVIDERS].map((benefit) => benefit.title),
  };
}
