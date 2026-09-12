import Image from "next/image";
import Link from "next/link";

export function Wordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const mark = size === "sm" ? 16 : 20;
  const word = size === "sm" ? 12 : 14;

  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label="PREPUMP home"
    >
      <Image
        src="/prepump-mark.png"
        alt=""
        width={mark}
        height={mark}
        priority
        className="shrink-0 transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-px"
      />
      <Image
        src="/prepump-wordmark.png"
        alt="PREPUMP"
        width={Math.round(word * 7.06)}
        height={word}
        priority
        className="shrink-0"
      />
    </Link>
  );
}
