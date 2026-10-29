import type { Metadata } from "next";
import { AudienceLink } from "../../components/AudienceLink";
import { MarketPitch } from "../../components/MarketPitch";
import { appJsonLd, CHECKED_ON, faqJsonLd, FOR_INSURED, FOR_PROVIDERS, QUESTIONS, SOURCES } from "../../lib/information";
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
  { title: "Film", body: "Walk each room with your phone and say anything worth knowing: the brand, how old it is, what you paid." },
  { title: "Review", body: "While you film, Meta's Muse models turn the video into a priced, room-by-room inventory." },
  { title: "Confirm", body: "If a line cannot be confirmed from the video, the app asks for the one thing that would confirm it." },
  { title: "Keep and send", body: "Your inventory and video stay on your account, ready to download, email, or send." },
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

function Benefits({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="info-benefits">
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

      <p className="kicker">Information</p>
      <h1>{title}</h1>
      <p className="info-lead">
        Film each room. 100proof turns the video into an inventory you can prove, with the brand, model, and count of
        what you own, what it costs to replace in your zip, and what it is worth today. When the video cannot settle a
        line, it asks you for the one thing that would.
      </p>
      <div className="info-actions">
        <AudienceLink audience="insured" className="button brand">
          Create your verifiable inventory
        </AudienceLink>
        <a className="button quiet" href="#providers">
          For insurers and administrators
        </a>
      </div>

      <section className="info-section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="info-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>
      </section>

      <section className="info-section" aria-labelledby="insured">
        <h2 id="insured">For homeowners and renters</h2>
        <Benefits items={FOR_INSURED} />
        <AudienceLink audience="insured" className="button brand info-cta">
          Start with your email
        </AudienceLink>
      </section>

      <section className="info-section" aria-labelledby="why">
        <h2 id="why">Why make a home inventory before you need one</h2>
        <ul className="info-facts">
          <li>
            The NAIC tells people to inventory every room with photos or video, keep it away from the home, and update
            it every year.
          </li>
          <li>In a 2023 Triple-I and Munich Re survey, 47% of homeowners said they had prepared an inventory of their possessions.</li>
          <li>The Texas Department of Insurance says a missing inventory can delay a contents claim, and that a phone video of each room is a valid start.</li>
          <li>
            J.D. Power&apos;s 2026 property claims study puts the average time from first notice of loss to final payment at
            40.7 days. In its 2025 study, satisfaction was 762 of 1,000 when a claim finished within 10 days and 595
            when it took more than 31.
          </li>
        </ul>
        <MarketPitch />
      </section>

      <section className="info-section" aria-labelledby="providers">
        <h2 id="providers">For insurers, adjusters, and administrators</h2>
        <p>
          A contents file usually arrives as a spreadsheet or a folder of photos, and the work is finding what is
          missing. A 100proof file arrives with its evidence attached and its open questions already listed.
        </p>
        <Benefits items={FOR_PROVIDERS} />
        <AudienceLink audience="provider" className="button quiet info-cta">
          Request a connection
        </AudienceLink>
      </section>

      <section className="info-section" aria-labelledby="questions">
        <h2 id="questions">Questions people ask</h2>
        {QUESTIONS.map((entry) => (
          <div key={entry.question} className="info-answer">
            <h3>{entry.question}</h3>
            {entry.answer.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ))}
      </section>

      <section className="info-section" aria-labelledby="not">
        <h2 id="not">Plain terms</h2>
        <p>
          100proof is not an insurance company, an adjuster, or a public adjuster. It does not interpret a policy,
          negotiate with an insurer, or decide coverage or payment, and it does not claim the list is 100% accurate.
          It is not a program of the NAIC, the Texas Department of Insurance, or any government, and it is not
          certified by Meta. It was built during the Meta Global AI Developer Hackathon 2026 and is entered as 100
          Proof.
        </p>
      </section>

      <section className="info-section" aria-labelledby="sources">
        <h2 id="sources">Sources</h2>
        <p className="hint">Checked {CHECKED_ON}.</p>
        <ul className="info-sources">
          {SOURCES.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer noopener" target="_blank">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
