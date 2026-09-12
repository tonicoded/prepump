import Image from "next/image";

const GLYPHS = ["$", "↑", "?", "+", "SOL", "↑"];

export function SideMarks() {
  return (
    <div aria-hidden className="meme-extras">
      <div className="meme-burst">
        <strong>99%</strong>
        <span>NOISE</span>
      </div>

      <div className="meme-chat-sticker">
        <span>WEN LAUNCH?</span>
        <strong>SOON™</strong>
      </div>

      <figure className="meme-character-card meme-character-cat">
        <Image
          src="/meme-crying-trader.png"
          alt=""
          width={1254}
          height={1254}
          sizes="(max-width: 1023px) 72px, 130px"
        />
        <figcaption>BOUGHT THE TOP</figcaption>
      </figure>

      <figure className="meme-character-card meme-character-skeleton">
        <Image
          src="/meme-waiting-skeleton.png"
          alt=""
          width={1254}
          height={1254}
          sizes="(max-width: 1023px) 72px, 130px"
        />
        <figcaption>STILL WAITING</figcaption>
      </figure>

      <figure className="meme-character-card meme-character-chad">
        <Image
          src="/meme-chad-holder.png"
          alt=""
          width={1254}
          height={1254}
          sizes="130px"
        />
        <figcaption>NEVER SOLD</figcaption>
      </figure>

      <span className="meme-tape meme-tape-left">NOBODY KNOWS</span>
      <span className="meme-tape meme-tape-right">RANDOM AF</span>

      <div className="meme-edge-glyphs">
        {GLYPHS.map((glyph, index) => (
          <span key={`${glyph}-${index}`}>{glyph}</span>
        ))}
      </div>
    </div>
  );
}
