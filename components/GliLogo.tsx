import Image from "next/image";

type Props = {
  variant?: "onLight" | "onDark";
  markOnly?: boolean;
  height?: number;
  className?: string;
};

const FULL_RATIO = 3880 / 1379;
const MARK_RATIO = 1370 / 1369;

const SOURCES = {
  onLight: { full: "/logo-gli-full.png", mark: "/logo-gli-mark.png" },
  onDark: { full: "/logo-gli-full-white.png", mark: "/logo-gli-mark-white.png" },
};

/** The real GLI (Grupo Linros Interinsumos) brand logo — crescent mark + wordmark. */
export default function GliLogo({ variant = "onLight", markOnly = false, height = 36, className }: Props) {
  const src = markOnly ? SOURCES[variant].mark : SOURCES[variant].full;
  const ratio = markOnly ? MARK_RATIO : FULL_RATIO;

  return (
    <Image
      src={src}
      alt="GLI · Grupo Linros Interinsumos"
      width={Math.round(height * ratio)}
      height={height}
      priority
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
