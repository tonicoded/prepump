# Individual participant execution

New, unfunded CLI rounds use one locally generated buyer wallet per **real deposit address**. Multiple deposits from the same address remain one participant. This is coordinated PREPUMP execution, not independent organic market activity.

The existing command remains:

```sh
npm run round -- go --yes --now --last 60
```

It freezes the deposits, reserves proportional shared launch costs, creates and saves each buyer key, funds the buyers and creator, generates the meme, creates the mint with a **zero creator buy**, submits the participant buys concurrently, then sends each buyer's actual tokens and unused buyer SOL to their original address. A successful payout also closes the temporary token account to reclaim its rent.

Requirements: a published per-round deposit wallet, sufficient deposits for each buyer's costs, Pinata configured, and `DEV_CUT_PERCENT=0`. Existing funded legacy rounds retain pooled execution. `--buy` and `--force` cannot override individual execution.

## Costs and execution

- Shared launch costs and creator/deposit reserves are split proportionally using integer lamports. Shared reserve leftovers remain in those round wallets; this version does not refund them automatically.
- Each participant funds their own two token-account rent reserves, transaction fees, priority fee, wallet rent floor and a slippage buffer. Unused **buyer-wallet** SOL returns after payout.
- Slippage and priority fee are frozen in the plan. Slippage must be above 0 and at most 50%. There is no guarantee of simultaneous inclusion, equal prices or small differences. A failed buy stays unfilled; no automatic higher-slippage retry.
- The default Token-2022 rent reserve is conservative, not an exact quote. Unknown mint extensions or fee changes can still cause a payout to fail.
- These are independent transactions, not an atomic bundle. Other traders may enter between creation and participant buys.

## Recovery

Back up the entire round data directory securely. `buyers/round-ID-RECIPIENT.json` contains a private key with mode 0600. Never commit or share it. Round records contain signed transaction bytes and must also remain private.

Resume explicitly:

```sh
npm run round -- go --yes --now --round ID --last 60
```

The frozen deposit list and buy budgets are reused; the new time window does not rescan them. Incomplete individual rounds are also retained by automatic round selection. `distribute --yes --round ID` resumes unfinished buys and payouts after creation.

Transactions are saved **before** broadcasting. On restart the existing signature is checked, and only identical signed bytes may be resent. Unknown, expired or on-chain-failed transactions do not silently turn into new buys. A failed/expired signed transaction requires operator reconciliation; there is intentionally no automatic replacement or refund of an uncertain purchase. A generation failure leaves SOL in the saved buyer wallets; resume the same round after correcting the generation issue.

A round-level exclusive lock prevents two execution processes. Normal exits release it. After a hard crash, inspect the lock's PID and confirm that process is no longer running before removing that exact stale lock.

No mainnet launch or transfer was performed to validate this change. Budget/reconciliation tests use mocks; end-to-end provider and zero-buy creation acceptance still require controlled verification before use with participant funds.
