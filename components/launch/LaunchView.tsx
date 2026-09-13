import { LaunchHero } from "./LaunchHero";
import { SideMarks } from "./SideMarks";

export function LaunchView({ deposits = false }: { deposits?: boolean }) {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-[112rem] items-center justify-center px-[clamp(1rem,4vw,3rem)] py-[clamp(1.5rem,5vh,4rem)]">
      <SideMarks />
      <LaunchHero deposits={deposits} />
    </div>
  );
}
