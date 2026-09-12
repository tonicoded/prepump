export const MEME_MODE_IDS = [
  "trend",
  "classic",
  "brand",
  "stock",
  "workplace",
  "animal",
  "cursed",
] as const;

export type MemeMode = (typeof MEME_MODE_IDS)[number];

export const MEME_MODES = [
  {
    id: "trend",
    label: "Trend thief",
    description: "Current meme grammar, fully original character.",
  },
  {
    id: "classic",
    label: "Classic remix",
    description: "Transform a known meme archetype into a fresh scene.",
  },
  {
    id: "brand",
    label: "Brand parody",
    description: "Unofficial fast-food, retail or corporate parody.",
  },
  {
    id: "stock",
    label: "Stock parody",
    description: "A public company or ticker turned into a character joke.",
  },
  {
    id: "workplace",
    label: "Office crashout",
    description: "Serious workplace language for a deeply unserious crisis.",
  },
  {
    id: "animal",
    label: "Animal lore",
    description: "A believable animal photo with unnecessary backstory.",
  },
  {
    id: "cursed",
    label: "Cursed object",
    description: "A mundane object behaving with terrible confidence.",
  },
] as const satisfies readonly {
  id: MemeMode;
  label: string;
  description: string;
}[];

export const DEFAULT_MEME_MODE: MemeMode = "trend";

export function isMemeMode(value: unknown): value is MemeMode {
  return MEME_MODES.some((mode) => mode.id === value);
}

export function normalizeMemeMode(value: unknown): MemeMode {
  return isMemeMode(value) ? value : DEFAULT_MEME_MODE;
}
