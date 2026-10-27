import Image from "next/image";
import Link from "next/link";
import logo from "../../../packages/ui/brand/logo.jpg";

export function Logo({ priority = true }: { priority?: boolean }) {
  return (
    <Link href="/" aria-label="100proof home">
      <Image src={logo} alt="" priority={priority} className="logo" />
    </Link>
  );
}
