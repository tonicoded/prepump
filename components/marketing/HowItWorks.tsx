const STEPS = [
  {
    number: "01",
    label: "PREBUY",
    title: "Connect & commit",
    body: "Connect your Solana wallet and choose how much SOL you want in the weekly round.",
    stamp: "YOU’RE EARLY",
  },
  {
    number: "02",
    label: "T–0",
    title: "The contract cooks",
    body: "At zero, deposits close. A random name, ticker and meme image are generated.",
    stamp: "NO INSIDERS",
  },
  {
    number: "03",
    label: "LAUNCH",
    title: "Born on pump.fun",
    body: "The contract automatically launches the mystery coin on pump.fun.",
    stamp: "SEND IT",
  },
  {
    number: "04",
    label: "PAYOUT",
    title: "Tokens hit your wallet",
    body: "Your share is sent automatically. The live chart appears here right away.",
    stamp: "NO CLAIM BUTTON",
  },
] as const;

const MECHANICS = [
  ["2%", "Automatic dev wallet"],
  ["FEES", "Creator fees go to holders"],
  ["30%", "Penalty for leaving early"],
  ["LIVE", "Expected share shown upfront"],
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
          Every week, committed SOL becomes a surprise pump.fun launch. Nobody
          knows the coin before the countdown ends.
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
          <h2>Most launches are noise.</h2>
          <p>
            PREPUMP makes the reveal the event. Everyone enters blind. The meme,
            name and ticker stay secret until launch.
          </p>
        </article>

        <article className="how-math-card">
          <div className="how-math-copy">
            <span className="how-mini-label">YOUR SHARE, BEFORE YOU BUY</span>
            <h2>1 SOL ÷ 5 SOL pool = 20%</h2>
            <p>Your wallet receives 20% of the participant token allocation.</p>
          </div>
          <dl className="how-mechanics">
            {MECHANICS.map(([value, label]) => (
              <div key={value}>
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
