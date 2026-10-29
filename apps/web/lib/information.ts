/**
 * The Information page and its structured data read from here, so the FAQ markup always matches the visible text.
 * Every answer has to stand on its own when an assistant quotes one sentence of it.
 * Public copy only: no ranking rules, thresholds, prompts, test method, or go-to-market numbers.
 * Checked 2026-10-29. Update the date and the sources together.
 */

export const CHECKED_ON = "2026-10-29";

/** One illustrative line, so a reader sees the product instead of a description of it. Labeled as an example on the page. */
export const SAMPLE_LINE = {
  name: "Sectional sofa, 3 pieces",
  room: "Living room",
  facts: [
    { label: "Brand", value: "Ashley, from what you said" },
    { label: "Bought", value: "2023, from what you said" },
    { label: "Condition", value: "Minor scuff on the left arm, clip 2 at 0:14" },
    { label: "Replacement in your zip", value: "$2,400, the price of a new one" },
    { label: "Worth today", value: "$1,512, after three years of wear and the scuff" },
    { label: "Seen", value: "Clip 2 at 0:14, clip 5 at 0:03" },
    { label: "Evidence", value: "Strong, no receipt yet" },
  ],
};

type Answer = { question: string; answer: string[] };

type Benefit = { title: string; body: string };

export const FOR_INSURED: Benefit[] = [
  {
    title: "No typing",
    body: "Film for up to ten minutes and talk as you go. The list is made from the video and what you said.",
  },
  {
    title: "Today's prices",
    body: "Each line gets what it costs to replace new in your zip and what it is worth today after wear and any damage the video shows.",
  },
  {
    title: "Asks only when it matters",
    body: "If the video cannot confirm a line, you are asked for one thing: a photo, a receipt, or one more shot.",
  },
  {
    title: "Yours, and private",
    body: "The video stays on your account in private storage. Your exact location is never saved, and we do not sell personal data.",
  },
];

export const FOR_PROVIDERS: Benefit[] = [
  {
    title: "The evidence on every line",
    body: "The clip and second it was seen, what the policyholder said, any receipt, and the comparable used to price it.",
  },
  {
    title: "Open items first",
    body: "Anything the video could not confirm is listed at the top of the file, so it is asked at capture, not weeks into a claim.",
  },
  {
    title: "Priced the way your desk prices",
    body: "Replacement cost for like kind and quality in the property's zip, and actual cash value after depreciation and any damage seen on camera, with the clip and second.",
  },
  {
    title: "Sealed and versioned",
    body: "A CSV and a versioned JSON claim file with a change history and a fingerprint. You keep every coverage and payment decision.",
  },
];

export const QUESTIONS: Answer[] = [
  {
    question: "Is 100proof the NAIC home inventory app?",
    answer: [
      "No. The NAIC publishes its own free home inventory app, and 100proof is not part of the NAIC or any government program.",
      "The NAIC and state regulators tell people to document every room with photos or video. 100proof is one way to do that: you film, and the video becomes the list.",
    ],
  },
  {
    question: "How is 100proof different from other home inventory apps?",
    answer: [
      "Most home inventory apps are catalogs you fill in item by item. 100proof starts from a video you narrate and prices each line in your zip.",
      "Each line shows what it is based on, and a line the video cannot confirm is marked as open instead of guessed. A receipt matched to a line marks it receipt verified.",
    ],
  },
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
      "100proof fills in those fields from your video, including the condition and any damage it can see, and asks for what the video could not show, such as a model label, a wider shot, or a receipt.",
    ],
  },
  {
    question: "How is replacement cost calculated?",
    answer: [
      "Replacement cost is what it costs to replace an item with a new one of like kind and quality, at current local prices, without a deduction for depreciation.",
      "100proof prices a new unit in the property's zip. It uses the exact product when its brand and model are confirmed and it is for sale; otherwise it uses a comparable of the same brand and type, or of the same kind, size, and material when the brand is not known, and the line says which. Condition and damage never lower replacement cost.",
    ],
  },
  {
    question: "What is actual cash value?",
    answer: [
      "Actual cash value is replacement cost minus a fair deduction for physical depreciation, based on the item's age, condition, and useful life. California Insurance Code section 2051 states it this way.",
      "100proof shows an actual cash value estimate beside each replacement amount, after age and any damage seen in the video. Your policy says which of the two it pays.",
    ],
  },
  {
    question: "How does 100proof handle damage or wear?",
    answer: [
      "As you film, Muse Spark 1.3 checks the condition of each item and notes damage it can see, such as a crack, a tear, a dent, or a stain, with the clip and second where it is clearest. Glare, shadows, and dust are not counted as damage, and when it cannot tell, it asks you.",
      "Damage lowers what an item is worth today, its actual cash value. Replacement cost stays the price of a new one of like kind and quality, because that is what replacement cost means. A clearer photo or your answer can correct the condition, and every change is logged on the line.",
    ],
  },
  {
    question: "What if I do not know the brand?",
    answer: [
      "Say what you know, or nothing. When no brand is read or said, Muse Spark 1.3 looks at what the video shows, such as part of a logo, a signature design, or a matching piece in the same room, and may name the brand it is likely to be, with those clues.",
      "A likely brand is marked as not confirmed and priced as a comparable, never as the exact product. A label photo or a receipt confirms it.",
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
      "100proof does not claim 100% accuracy. Every line carries an accuracy mark based on the evidence behind it, from Needs evidence, through Estimated from video, up to Strong without a receipt.",
      "A receipt earns the top mark, Receipt verified, because it ties that item to you. A price you type in is shown as yours until a receipt backs it. When something cannot be confirmed, the line is flagged and the app asks for what would confirm it instead of guessing.",
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
    question: "What will I get back if something happens?",
    answer: [
      "That depends on your policy: its contents limit, your deductible, and whether it pays replacement cost or actual cash value. No inventory can promise a payment, and 100proof does not.",
      "What an active 100proof inventory changes is the starting point. Instead of rebuilding a list from memory, you hand over what you own with the evidence behind each line, so the documented amount is settled from your record rather than argued from memory.",
    ],
  },
  {
    question: "Can an insurer or auditor rely on a 100proof file?",
    answer: [
      "Every line keeps the camera, what you said, the receipt, and the comparable apart, with a change history, and anything unproven is listed as an exception. The file is sealed with a fingerprint and carries the version of the standard that produced it.",
      "Each line also carries an accuracy mark earned from checkable evidence, and the file is run against consistency checks before it is exported. The carrier still makes every coverage and payment decision.",
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
      "Carriers, administrators, agents, and property managers can request a connection at 100proof.tech/?for=providers.",
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
      "A home inventory app for insurance. Film each room on a phone, and Meta's Muse Spark 1.3 turns the video into a room-by-room inventory with counts, brands, models, condition, replacement cost in your zip, and actual cash value after wear and damage, then asks for what it could not see.",
    featureList: [...FOR_INSURED, ...FOR_PROVIDERS].map((benefit) => benefit.title),
  };
}
