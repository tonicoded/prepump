/**
 * Outbound links. Fill these in before going live — they are the only
 * placeholders left in the interface.
 */
export const LINKS = {
  x: "#",
  telegram: "#",
  docs: "#",
  terms: "#",
  privacy: "#",
} as const;

export const SOCIALS = [
  { label: "X", href: LINKS.x },
  { label: "Telegram", href: LINKS.telegram },
] as const;
