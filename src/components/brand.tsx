import { Link } from "@tanstack/react-router";

import horizontalDark from "@/assets/brand/logo-horizontal-dark.webp";
import horizontalLight from "@/assets/brand/logo-horizontal-light.webp";
import markDark from "@/assets/brand/mark-dark.webp";
import markLight from "@/assets/brand/mark-light.webp";
import monogramDark from "@/assets/brand/monogram-dark.webp";
import monogramLight from "@/assets/brand/monogram-light.webp";
import stackedDark from "@/assets/brand/logo-stacked-dark.webp";
import stackedLight from "@/assets/brand/logo-stacked-light.webp";
import { cn } from "@/lib/utils";

// The cercit logo set (docs/design/brand-identity.md). Built from the source
// artwork by scripts/brand/make-logos.py; do not edit the images by hand.
//   horizontal  car + wordmark side by side — headers, footer
//   stacked     car above the wordmark — sign-in and other centred screens
//   mark        the car alone — tight spaces where the name is already shown
//   monogram    "c." — favicons and anything smaller than ~24 px tall
const SOURCES = {
  horizontal: { light: horizontalLight, dark: horizontalDark, ratio: 4.162 },
  stacked: { light: stackedLight, dark: stackedDark, ratio: 1.504 },
  mark: { light: markLight, dark: markDark, ratio: 2.388 },
  monogram: { light: monogramLight, dark: monogramDark, ratio: 1.185 },
} as const;

export type LogoVariant = keyof typeof SOURCES;

/**
 * `tone` picks the version for the background behind the logo:
 * "auto" follows the site theme (navy wordmark in light, white in dark);
 * "onLight" / "onDark" force one, for surfaces that do not change with the theme.
 */
export function Logo({
  variant = "horizontal",
  tone = "auto",
  height = 32,
  className,
}: {
  variant?: LogoVariant;
  tone?: "auto" | "onLight" | "onDark";
  height?: number;
  className?: string;
}) {
  const src = SOURCES[variant];
  const width = Math.round(height * src.ratio);
  const img = (file: string, extra?: string) => (
    <img
      src={file}
      alt=""
      width={width}
      height={height}
      decoding="async"
      draggable={false}
      className={cn("block h-auto max-w-full select-none", extra)}
      style={{ height, width: "auto" }}
    />
  );
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} role="img" aria-label="cercit">
      {tone === "onLight" && img(src.light)}
      {tone === "onDark" && img(src.dark)}
      {tone === "auto" && (
        <>
          {img(src.light, "dark:hidden")}
          {img(src.dark, "hidden dark:block")}
        </>
      )}
    </span>
  );
}

/** The logo as a link, the usual top-left use. */
export function BrandLogo({
  to = "/",
  className,
  ...logo
}: {
  to?: string;
  className?: string;
} & Parameters<typeof Logo>[0]) {
  return (
    <Link to={to} className={cn("inline-flex items-center rounded-md", className)} aria-label="cercit home">
      <Logo {...logo} />
    </Link>
  );
}
