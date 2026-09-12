import Image from "next/image";

export function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* The mark, blown up and pushed almost all the way into the dark. */}
      <div
        className="anim-drift absolute"
        style={{
          top: "clamp(-22rem, -24vh, -7rem)",
          right: "clamp(-26rem, -17vw, -7rem)",
          width: "clamp(30rem, 58vw, 58rem)",
          height: "clamp(30rem, 58vw, 58rem)",
          filter: "blur(2px)",
        }}
      >
        <Image
          src="/prepump-mark.png"
          alt=""
          fill
          sizes="46vw"
          className="object-contain opacity-[0.028] grayscale-[0.35]"
          priority
        />
      </div>

      {/* Cold brand light pooling behind the hero. */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: "16%",
          width: "min(70rem, 130vw)",
          height: "32rem",
          background:
            "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-pump-500) 9%, transparent), transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      <div className="vignette absolute inset-0" />
    </div>
  );
}
