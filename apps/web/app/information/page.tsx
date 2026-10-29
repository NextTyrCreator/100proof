import type { Metadata } from "next";
import { AudienceLink } from "../../components/AudienceLink";
import {
  appJsonLd,
  CHECKED_ON,
  faqJsonLd,
  FOR_INSURED,
  FOR_PROVIDERS,
  QUESTIONS,
  SAMPLE_LINE,
  SOURCES,
} from "../../lib/information";
import { siteUrl } from "../../lib/site";

const title = "Home inventory for insurance, from a phone video";
const description =
  "Film each room on your phone and get a home inventory your insurer can work from: counts, brands, models, replacement cost in your zip, and actual cash value. For homeowners, renters, insurers, and claims administrators.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/information" },
  openGraph: { type: "article", url: "/information", title: `${title} · 100proof`, description },
  twitter: { card: "summary", title: `${title} · 100proof`, description },
};

const STEPS = [
  { title: "Film", body: "Walk room by room for up to ten minutes. Say the brand, the year, and what you paid." },
  {
    title: "Review",
    body: "Meta's Muse Spark 1.3 lists each line as you film: what it is, its brand, its condition, and any damage it can see. Each line is priced new in your zip. Anything it cannot confirm is marked, and you are asked for the one thing that would.",
  },
  { title: "Keep and send", body: "The inventory and video stay on your account. Download a spreadsheet or claim file, or email it." },
];

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Static content from lib/information.ts; "<" is escaped so the JSON cannot close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="info-points">
      {items.map((item) => (
        <li key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function InformationPage() {
  return (
    <article className="narrow info">
      <JsonLd data={faqJsonLd()} />
      <JsonLd data={appJsonLd(`${siteUrl()}/information`)} />

      <header className="info-top">
        <p className="info-kicker">Home inventory app for insurance</p>
        <h1>Home inventory for insurance, from a phone video</h1>
        <p className="info-lead">
          Walk through your home with your phone and talk as you go. 100proof turns the video into a room-by-room list with
          brands, counts, what each thing costs to replace in your zip, and what it is worth today.
        </p>
        <div className="info-actions">
          <AudienceLink audience="insured" className="button login-send">
            Start your inventory
          </AudienceLink>
          <AudienceLink audience="provider" className="info-text-link">
            For insurers and administrators
          </AudienceLink>
        </div>
        <p className="info-meta">Free to start · Runs in your phone&apos;s browser · Nothing to install</p>
      </header>

      <section className="info-section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="info-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="info-section" aria-labelledby="sample">
        <h2 id="sample">What one line looks like</h2>
        <figure className="info-sample">
          <div className="info-sample-head">
            <strong>{SAMPLE_LINE.name}</strong>
            <span>{SAMPLE_LINE.room}</span>
          </div>
          <dl>
            {SAMPLE_LINE.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <figcaption>An example. Your prices come from your zip and what the video shows.</figcaption>
        </figure>
      </section>

      <section className="info-section" aria-labelledby="insured">
        <h2 id="insured">For homeowners and renters</h2>
        <Points items={FOR_INSURED} />
        <AudienceLink audience="insured" className="info-text-link">
          Start with your email
        </AudienceLink>
      </section>

      <section className="info-section" aria-labelledby="providers">
        <h2 id="providers">For insurers, adjusters, and administrators</h2>
        <p>
          A contents file usually arrives as a spreadsheet or a folder of photos. A 100proof file arrives with its evidence
          attached and its open questions already listed.
        </p>
        <Points items={FOR_PROVIDERS} />
        <AudienceLink audience="provider" className="info-text-link">
          Request a connection
        </AudienceLink>
      </section>

      <section className="info-section" aria-labelledby="why">
        <h2 id="why">Why make one before you need it</h2>
        <ul className="info-facts">
          <li>The NAIC tells people to inventory every room with photos or video, keep it away from the home, and update it every year.</li>
          <li>In a 2023 Triple-I and Munich Re survey, 47% of homeowners said they had prepared an inventory of their possessions.</li>
          <li>The Texas Department of Insurance says a missing inventory can delay a contents claim, and that a phone video of each room is a valid start.</li>
          <li>
            After the January 2025 Los Angeles fires, California asked insurers to advance at least 75% of contents limits
            without a list. The rest of the limit still needed one.
          </li>
          <li>J.D. Power&apos;s 2026 property claims study puts the average time from first notice of loss to final payment at 40.7 days.</li>
        </ul>
        <p className="info-figure">
          <strong>$3–7 billion a year</strong>
          <span>
            Our conservative estimate of US contents coverage people paid for and never collected because it was not
            documented. It is not a government figure.
          </span>
        </p>
      </section>

      <section className="info-section" aria-labelledby="questions">
        <h2 id="questions">Questions</h2>
        <div className="info-faq">
          {QUESTIONS.map((entry, index) => (
            <details key={entry.question} open={index === 0}>
              <summary>
                <h3>{entry.question}</h3>
                <span className="fold-mark" aria-hidden="true" />
              </summary>
              {entry.answer.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className="info-section info-small" aria-labelledby="not">
        <h2 id="not">Plain terms</h2>
        <p>
          100proof is not an insurance company, an adjuster, or a public adjuster. It does not interpret a policy,
          negotiate with an insurer, or decide coverage or payment, and it does not claim the list is 100% accurate. It is
          not a program of the NAIC, the Texas Department of Insurance, or any government, and it is not certified by Meta.
          It was built during the Meta Global AI Developer Hackathon 2026 and is entered as 100 Proof.
        </p>
      </section>

      <section className="info-section info-small" aria-labelledby="sources">
        <h2 id="sources">Sources</h2>
        <p>Checked {CHECKED_ON}.</p>
        <ul className="info-sources">
          {SOURCES.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer noopener" target="_blank">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p>
          <a href="/llms.txt">A plain-text summary for assistants</a>
        </p>
      </section>
    </article>
  );
}
