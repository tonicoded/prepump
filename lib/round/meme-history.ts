import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MemeHistoryEntry } from "./meme.ts";

type StoredRound = {
  token?: { name?: string; ticker?: string; description?: string };
  launch?: { launchedAt?: string };
};

/**
 * Every coin PREPUMP ever launched from this machine, newest first: the live
 * season, /dev tests and archived seasons alike. The meme writer uses it so a
 * name, ticker or main subject never comes back.
 */
export function loadMemeHistory(root = path.join(process.cwd(), ".round")): MemeHistoryEntry[] {
  const found: { entry: MemeHistoryEntry; at: number }[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        // Buyer, owner and deposit folders hold keys, never coin records.
        if (!["buyers", "owners", "deposits", "previews"].includes(item.name)) walk(full, depth + 1);
      } else if (/^round-\d+\.json$/.test(item.name)) {
        try {
          const record = JSON.parse(readFileSync(full, "utf8")) as StoredRound;
          const { name, ticker, description } = record.token ?? {};
          if (!name || !ticker) continue;
          found.push({
            entry: { name, ticker, description },
            at: Date.parse(record.launch?.launchedAt ?? "") || 0,
          });
        } catch {
          // A damaged record must not stop a launch.
        }
      }
    }
  };
  walk(root, 0);

  const seen = new Set<string>();
  return found
    .sort((a, b) => b.at - a.at)
    .map(({ entry }) => entry)
    .filter((entry) => {
      const key = `${entry.name.toLowerCase()}|${entry.ticker.toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
