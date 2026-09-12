import { LaunchHero } from "./LaunchHero";
import { SideMarks } from "./SideMarks";

export function LaunchView() {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-[112rem] items-center justify-center px-[clamp(1rem,4vw,3rem)] py-[clamp(2rem,7vh,5rem)]">
      <SideMarks />
      <LaunchHero />
    </div>
  );
}
