# cercit brand identity

Status: in use from 27 Sep 2026. Every new screen, document, deck or design brief follows this file.

## 1. The logo

A car drawn as a **circuit board with a chip at its heart** — vehicle finance run by intelligent checks — beside the name **cercit** in lower case, with the dot on the **i** in brand blue.

| Version | Looks like | Use |
|---|---|---|
| **Horizontal** | car left, name right | site headers, footer, staff console, letters, deck title slides |
| **Stacked** | car above name | centred screens, square social images, the cover of documents |
| **Mark** | the car alone | where the name is already next to it, or space is short |
| **Monogram "c."** | the c of the wordmark + the blue dot | favicon, app icon, anything under ~24 px tall |

Each comes in two tones:
- **light** — for light backgrounds: navy wordmark, blue car.
- **dark** — for dark backgrounds: white wordmark (`#F0F4F7`), car in brighter blue so thin lines still read on navy.

## 2. Files

| Where | What |
|---|---|
| `docs/brand/source/` | the original artwork (do not edit) |
| `scripts/brand/make-logos.py` | builds every file below from the source — re-run it if the source changes |
| `src/assets/brand/` | website files: `logo-horizontal-{light,dark}`, `logo-stacked-{light,dark}`, `mark-{light,dark}`, `monogram-{light,dark}` as `.webp` (used) and `.png` |
| `public/` | `favicon.ico` (16/32/48), `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` |
| `docs/brand/` | large PNGs (1,200–1,600 px wide) for decks, PDFs, Lovable and social posts; `app-icon.png` 512 px |

## 3. In the code

One component — never place logo images by hand:

```tsx
import { BrandLogo, Logo } from "@/components/brand";

<BrandLogo height={30} />                    // horizontal, links home, follows the theme
<BrandLogo to="/dashboard" height={30} />    // staff console
<Logo variant="stacked" height={96} />       // no link
<Logo variant="mark" tone="onDark" />        // force a tone on a surface that never changes theme
```

`tone="auto"` (default) shows the light version in light mode and the dark version in dark mode (the site's `dark` class on `<html>`).

**Where it is today:** landing header (top left, 36 px), landing footer (34 px), staff console sidebar, sign-in, apply, application status and legal pages (30 px), browser tab and home-screen icons.

## 4. Rules

- **Minimum size:** horizontal 24 px tall; below that use the monogram. Mark 20 px tall.
- **Clear space:** at least the height of the "c" on every side.
- **Backgrounds:** light version on backgrounds lighter than mid-grey, dark version on darker ones. On photos, only where the area behind the logo is calm (the landing hero's sky/dashboard is fine).
- **Never:** recolour the car, stretch or squash, add shadows or outlines, put the wordmark in another font, rotate, place the light version on dark or the reverse, write "Cercit" or "CERCIT" in running text — always **cercit**.
- The wordmark is part of the image; do not retype it as text next to the mark.

## 5. Colours from the logo

| Name | Hex | Where |
|---|---|---|
| Wordmark navy | `#102A54` | wordmark (light version); good for headings on white |
| Car cyan (tail) | `#5FDCFD` | start of the car gradient |
| Car blue (nose) | `#004FE2` | end of the car gradient, the dot on the i |
| Brand blue (site primary) | `#2563EB` light / `#4D85FB` dark | buttons, links (see the design brief for the full palette) |

The full interface palette, fonts and spacing are in `docs/design/car-character-cercit-design.md` (sections 2–4); the logo sits on top of that system.

## 6. Still to do

- Deck slides (`public/decks/*.html` and their PDFs) and generated letters (sanction letter, agreement) still show the text name — add the logo when those are next touched.
- The original artwork is a generated raster image; a hand-drawn vector (SVG) version would print sharper at large sizes. Ask a designer or an image tool for an SVG trace when needed.
