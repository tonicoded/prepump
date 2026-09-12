import { ButtonLink } from "@/components/ui/Button";
import { IconExternal } from "@/components/ui/Icons";
import { LINKS } from "@/lib/links";

export function FollowCard() {
  return (
    <section className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <h2 className="text-[clamp(0.75rem,1.7vh,0.875rem)] font-semibold tracking-[0.06em] uppercase">
        Be there when it opens
      </h2>
      <p className="mt-[clamp(0.4rem,1.2vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
        Round #001 is announced in one place. There is no presale, no whitelist
        and no allocation before a round opens.
      </p>

      <ul className="my-auto flex flex-col gap-[clamp(0.3rem,1vh,0.6rem)] py-[var(--gap)]">
        {[
          "The opening date for round #001",
          "The deposit window and the platform fee",
          "Program, escrow and mint addresses",
        ].map((item) => (
          <li
            key={item}
            className="flex items-baseline gap-2 text-[clamp(0.6875rem,1.5vh,0.8125rem)] text-chalk-dim"
          >
            <span className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-pump-400" />
            {item}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <ButtonLink external href={LINKS.x} variant="outline" size="md">
          Follow on X <IconExternal />
        </ButtonLink>
        <ButtonLink external href={LINKS.telegram} variant="quiet" size="md">
          Join Telegram <IconExternal />
        </ButtonLink>
      </div>
    </section>
  );
}
