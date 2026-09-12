const STEPS = [
  {
    number: "01",
    label: "DEPOSIT",
    title: "Connect & deposit",
    body: "Connect your Solana wallet and put SOL into the round before the timer hits zero.",
    stamp: "FAIR LAUNCH",
  },
  {
    number: "02",
    label: "T–0",
    title: "Nobody knows the coin",
    body: "Deposits close. Only then does AI generate the name, ticker and meme image.",
    stamp: "NO INSIDERS",
  },
  {
    number: "03",
    label: "LAUNCH",
    title: "Born on pump.fun",
    body: "The coin launches on pump.fun straight away, bought with the whole pool.",
    stamp: "SEND IT",
  },
  {
    number: "04",
    label: "PAYOUT",
    title: "Tokens hit your wallet",
    body: "Everyone’s tokens are sent automatically, in proportion to what they put in.",
    stamp: "NO CLAIM BUTTON",
  },
] as const;

const MECHANICS = [
  ["0%", "Team allocation"],
  ["0%", "PREPUMP fee"],
  ["100%", "Tokens to depositors"],
  ["DEV", "Gets pump.fun creator rewards"],
] as const;

export function HowItWorks() {
  return (
    <div className="how-page">
      <header className="how-header">
        <span className="how-kicker">HOW IT WORKS // NO BORING WHITEPAPER</span>
        <h1>
          ONE TIMER. ONE RANDOM MEME.
          <span> ZERO INSIDERS.</span>
        </h1>
        <p>
          Every round, the deposited SOL becomes a surprise pump.fun launch.
          Nobody knows the coin before the countdown ends.
        </p>
      </header>

      <section className="how-steps" aria-label="The PREPUMP launch flow">
        {STEPS.map((step) => (
          <article key={step.number} className="how-step-card">
            <div className="how-step-top">
              <span className="how-step-number">{step.number}</span>
              <span className="how-step-label">{step.label}</span>
            </div>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <span className="how-step-stamp">{step.stamp}</span>
          </article>
        ))}
      </section>

      <section className="how-bottom">
        <article className="how-why-card">
          <span className="how-mini-label">WHY PREPUMP?</span>
          <h2>Everyone enters blind.</h2>
          <p>
            No presale, no team bag, no insiders. From deposit to launch to
            payout, it all runs automatically.
          </p>
        </article>

        <article className="how-math-card">
          <div className="how-math-copy">
            <span className="how-mini-label">YOUR SHARE</span>
            <h2>1 SOL in a 5 SOL pool = 20%</h2>
            <p>
              That’s your cut of every token the launch buys. The pool can grow
              until T-0, so your final % locks when the timer ends.
            </p>
          </div>
          <dl className="how-mechanics">
            {MECHANICS.map(([value, label]) => (
              <div key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </div>
  );
}
