/** Outbound links used across the site and written into token metadata. */
export const LINKS = {
  x: "https://x.com/prepumpsol",
  telegram: "https://t.me/+Esoro50UlzQ1NTY0",
  website: "https://www.prepump.lol",
  docs: "https://www.prepump.lol",
  terms: "#",
  privacy: "#",
} as const;

export const SOCIALS = [
  { label: "X", href: LINKS.x },
  { label: "Telegram", href: LINKS.telegram },
] as const;
