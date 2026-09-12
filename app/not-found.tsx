import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="label-xs">404</p>
      <h1 className="mt-3 text-[clamp(1.75rem,6vh,3.5rem)] leading-none font-bold tracking-[-0.035em]">
        NOTHING TO REVEAL
        <span className="block text-mute">AT THIS ADDRESS.</span>
      </h1>
      <p className="mt-4 max-w-[28rem] text-[13px] leading-relaxed text-mute">
        The round you are looking for does not exist. The current round is
        always on the launch page.
      </p>
      <ButtonLink href="/" variant="primary" size="lg" className="mt-6">
        GO TO CURRENT ROUND
      </ButtonLink>
    </div>
  );
}
