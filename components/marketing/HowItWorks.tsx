import Link from "next/link";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    number: "01",
    label: "Deposit",
    title: "Enter before T‑0",
    body: "Connect a Solana wallet and deposit SOL while the round is open. Your share updates as the pool grows.",
  },
  {
    number: "02",
    label: "Reveal",
    title: "The meme is made blind",
    body: "Deposits lock first. Only then are the name, ticker, lore and artwork generated—nobody gets an early look.",
  },
  {
    number: "03",
    label: "Launch",
    title: "The pool funds the launch",
    body: "Launch, rent, payout and pump.fun costs come out of the pool. The remainder becomes one combined pump.fun buy.",
  },
  {
    number: "04",
    label: "Distribute",
    title: "Tokens arrive automatically",
    body: "Every token bought by the round is sent to participants in proportion to their deposit. No claim button needed.",
  },
] as const;

const RULES = [
  ["0%", "PREPUMP platform fee"],
  ["0%", "Team token allocation"],
  ["100%", "Purchased tokens to participants"],
] as const;

export function HowItWorks() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.kicker}>THE WHOLE LOOP // FOUR STEPS</span>
            <h1>
              Deposit blind.
              <span> Receive your share.</span>
            </h1>
            <p>
              One mystery meme, one pooled pump.fun buy, and a proportional
              token payout when the round launches.
            </p>
          </div>
          <Link href="/" className={styles.liveLink}>
            View live round <span aria-hidden>→</span>
          </Link>
        </header>

        <section className={styles.flow} aria-labelledby="flow-title">
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>ROUND FLOW</span>
            <h2 id="flow-title">From SOL to tokens</h2>
          </div>

          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.number} className={styles.step}>
                <div className={styles.stepMeta}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span className={styles.stepLabel}>{step.label}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.details} aria-label="Pool costs and allocation">
          <article className={styles.moneyCard}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>WHERE THE SOL GOES</span>
              <h2>The round pays its own way.</h2>
            </div>
            <p className={styles.cardIntro}>
              The permanent deposit wallet does not subsidize the buy. Before
              launch, estimated operating costs are deducted from the gross pool.
            </p>
            <div className={styles.equation} aria-label="Pool funding calculation">
              <div>
                <strong>Gross pool</strong>
                <span>all eligible deposits</span>
              </div>
              <b aria-hidden>−</b>
              <div>
                <strong>Round costs</strong>
                <span>launch, rent, payouts + pump.fun</span>
              </div>
              <b aria-hidden>=</b>
              <div className={styles.equationResult}>
                <strong>Net buy</strong>
                <span>one pump.fun purchase</span>
              </div>
            </div>
          </article>

          <article className={styles.shareCard}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>YOUR ALLOCATION</span>
              <h2>Your percentage stays simple.</h2>
            </div>
            <div className={styles.shareExample}>
              <span className={styles.shareFormula}>1 SOL ÷ 5 SOL</span>
              <strong>= 20%</strong>
              <p>of every token purchased by that round</p>
            </div>
            <dl className={styles.rules}>
              {RULES.map(([value, label]) => (
                <div key={label}>
                  <dt>{value}</dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.creatorNote}>
              Pump.fun creator rewards accrue separately to PREPUMP&rsquo;s
              per-coin creator wallet.
            </p>
          </article>
        </section>

        <p className={styles.footnote}>
          Crypto assets are highly volatile. Always check the amount and
          destination before signing a transaction.
        </p>
      </div>
    </div>
  );
}
