import { LaunchView } from "@/components/launch/LaunchView";

/**
 * HOME_DEPOSITS_ENABLED=true swaps the coming-soon countdown for the live
 * deposit card. The card itself follows ROUND_OPENS_AT / ROUND_CLOSES_AT, so
 * it counts down, opens and closes on its own.
 */
export default function Page() {
  return <LaunchView deposits={process.env.HOME_DEPOSITS_ENABLED === "true"} />;
}
