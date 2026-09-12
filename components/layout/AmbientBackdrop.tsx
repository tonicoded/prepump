import Image from "next/image";

export function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="meme-halftone absolute inset-0" />

      {/* Original PREPUMP mark remains visible as a giant watermark. */}
      <div
        className="anim-drift absolute left-1/2 -translate-x-1/2"
        style={{
          top: "clamp(7rem, 16vh, 11rem)",
          width: "clamp(22rem, 46vw, 46rem)",
          height: "clamp(22rem, 46vw, 46rem)",
        }}
      >
        <Image
          src="/prepump-mark.png"
          alt=""
          fill
          sizes="46vw"
          className="object-contain opacity-[0.08] brightness-0"
          priority
        />
      </div>

      <div className="meme-art absolute inset-x-0 top-[13%] bottom-[8%] hidden sm:block">
        <Image
          src="/prepump-meme-collage.png"
          alt=""
          fill
          sizes="(min-width: 640px) 100vw, 1px"
          className="object-contain"
          priority
        />
      </div>

      <Image
        src="/prepump-meme-collage.png"
        alt=""
        width={1983}
        height={793}
        sizes="128vw"
        className="meme-art-mobile absolute top-[18%] left-1/2 h-auto w-[128vw] max-w-none -translate-x-1/2 sm:hidden"
        unoptimized
        priority
      />

      <div className="meme-speed-lines absolute inset-0" />
    </div>
  );
}
