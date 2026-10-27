import Image from "next/image";
import mark from "../../../packages/ui/brand/loader-mark.png";

export function Loader({ size = 128, layout = "page" }: { size?: number; layout?: "page" | "inline" }) {
  return (
    <div
      className={layout === "page" ? "loader-screen" : "loader-inline"}
      role="status"
      style={{ "--loader-size": `${size}px` } as React.CSSProperties}
    >
      <Image
        src={mark}
        alt=""
        width={mark.width}
        height={mark.height}
        sizes={`${size}px`}
        quality={92}
        className="loader-mark"
        priority
        style={{ width: size, height: size }}
      />
      <span className="loader-label">Loading</span>
    </div>
  );
}
