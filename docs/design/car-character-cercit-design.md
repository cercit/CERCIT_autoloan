# cercit design brief for the interactive car character

Use this together with `lovable_interactive_car_character_master_prompt.md`. Where the two disagree, **this file wins** — it holds cercit's real design system, so the character can be dropped into the cercit site later without restyling.

Paste this whole file into Lovable after the master prompt, with the line:
"Apply the cercit design brief below. It overrides the colours, fonts and events in the master prompt."

---

## 1. About cercit (context for the character)

- **cercit** (always lower case) — Credit Evaluation and Risk Compliance Intelligence Tool. A demo vehicle-finance product for Indian banks and NBFCs: the customer applies for a **new car loan**; the lender's credit officer gets an auto-built appraisal memo.
- Customers are **salaried Indians buying a new car**, mostly on a phone, often right after a test drive at the dealer.
- Tone: calm, clear, trustworthy. Plain words, short sentences. No hype, no slang, no emojis.
- Money in rupees with Indian grouping: **₹8,50,000**, "₹8.5 lakh". Dates like **27 Sep 2026**. Interest "8.99% p.a.".

## 1a. Logo

cercit's logo is a car drawn as a circuit board with a chip at its heart, beside the name "cercit" (lower case, blue dot on the i). Attached as `cercit-logo-horizontal-light.png` / `-dark.png` and `cercit-mark-light.png` / `-dark.png`.

- Show the horizontal logo top-left of the demo page, 30–36 px tall; light version on light backgrounds, dark version on dark.
- **The character is a separate, friendly car — do not copy the logo's circuit car into the character**, and do not add circuit lines to the character. The two should feel like family through colour only: the character's accents use the logo's blues (cyan `#5FDCFD` → blue `#004FE2`).
- Full rules: `docs/design/brand-identity.md` in the cercit repo.

## 2. Colours — replace section 15 of the master prompt

cercit's tokens are defined in OKLCH in the code; hex values below are the same colours for Lovable.

**Light theme**

| Token | Hex | Use |
|---|---|---|
| background | `#F6F8FA` | page |
| card | `#FFFFFF` | cards, form panel |
| surface-subtle | `#F3F6F9` | table stripes, quiet panels |
| foreground (text) | `#111826` | body text |
| muted text | `#637185` | hints, secondary text |
| border | `#DEE4EC` | borders, inputs |
| **primary** | `#2563EB` | buttons, links, focus ring, active step |
| accent | `#E4EEFA` | selected/hover backgrounds |
| success | `#01993F` | completed, verified |
| warning | `#E8B10C` | needs attention |
| destructive | `#E50014` | errors only |

**Dark theme**

| Token | Hex |
|---|---|
| background | `#0E141F` |
| card | `#181E2B` |
| surface-subtle | `#1C2330` |
| foreground | `#F0F4F7` |
| muted text | `#99A6B8` |
| border | white at 12% opacity |
| **primary** | `#4D85FB` |
| success | `#43B966` |
| warning | `#EEBD3A` |
| destructive | `#F4514F` |

**Hero / "cockpit" palette** (the landing page's night-drive look — use for the character's stage, not for forms)

| Token | Hex | Use |
|---|---|---|
| hero background | `#00030A` | deep night navy |
| hero primary | `#0083FF` | glows, highlights |
| electric | `#00A5FF` | headlight glow, pupils' catch-light in dark mode |
| hero muted text | `#C2D3E4` | text on the hero |

Theme switching: cercit uses a `dark` class on `<html>` and remembers the choice in `localStorage` under the key `cercit-theme`. Use the same so the component follows the site's toggle.

## 3. Typography

| Role | Font (Google Fonts) | Weights |
|---|---|---|
| App and forms | **Plus Jakarta Sans** (fallback Inter, system-ui) | 400, 500, 600, 700 |
| Landing / marketing headings | **Manrope** | 600, 700, 800 |
| Numbers in tables and amounts | same font with `font-variant-numeric: tabular-nums` | |

Headings are sentence case ("Apply for your car loan"), never Title Case.

## 4. Shape, spacing, depth

- Base radius **8px**; inputs and buttons 8px; cards 12px; dialogs and the character's stage 20px.
- Borders 1px in the border token; shadows soft and rare (one level for cards, one for dialogs).
- Layout gap scale: 4, 8, 12, 16, 24, 32 px. Minimum 16px side padding on phones.
- Icons: **lucide-react**, 16–20px, stroke style (no filled icon sets, no emojis).

## 5. Tech stack — so the component ports straight into cercit

- React 19 + TypeScript, **Tailwind CSS v4**, shadcn/ui (Radix) components, lucide-react icons, `sonner` for toasts. Routing in cercit is TanStack Router — keep the character free of any router code.
- **No backend.** No Supabase, no API calls, no real data. Mock data only.
- Deliver the character as **one self-contained folder** (for example `src/components/character/`) containing `CarCharacter.tsx`, its SVG/animation parts, `expressions.ts` (expression names) and `events.ts` (event → expression map). No global state library.
- Colours through CSS variables (the tokens above), not hard-coded, so light/dark follows the site.

## 6. The character — adjustments to the master prompt

- **Look:** keep the silver hatchback/crossover, graphite glass, no logos. On dark backgrounds give the headlights a soft **electric blue (`#00A5FF`) glow**; in light mode cool white. Eyes sit in the windscreen; pupils dark graphite with a small catch-light.
- **Size:** about 280–360px wide on desktop beside the form; 160–200px on phones at the top, shrinking to a small 64px "companion" that sticks to the corner while the customer scrolls long steps.
- **Motion:** subtle. Respect `prefers-reduced-motion`: then no bouncing or idle movement — only instant expression changes and blinks.
- **Accessibility:** the drawing is `aria-hidden`. Anything the character "says" must also be written as text (a one-line caption under it, in a polite live region). No information may be carried by the face alone.
- **Performance budget:** SVG + CSS/Web Animations preferred (the cercit landing already runs a canvas dot field and large images). Under ~60 KB for the whole component. Use Three.js only if it stays under ~150 KB gzipped and is lazy-loaded.

## 7. Privacy gestures (new — please add)

The car should **visibly look away or close its eyes** whenever the customer types something private. It is a small touch customers notice and it matches cercit's privacy rules.

| When | Expression |
|---|---|
| Focus in an OTP box | `LOOKING_AWAY` (eyes turned aside) |
| Focus in a document-password box (payslip / Form 16 / bank statement PDFs are often locked) | `LOOKING_AWAY` |
| Typing PAN or the Aadhaar last 4 digits | `LOOKING_AWAY` |
| Live photo (selfie) camera is open | eyes closed (use `SLEEPY` lids fully shut, or a new `EYES_CLOSED` if simple) |
| Leaving the field | back to `IDLE` |

## 8. Events — cercit's real application steps

Keep the master prompt's events and add these, which match cercit's actual flow (document map of 27 Sep 2026). Suggested expressions in brackets; keep all of them in the one config object.

| Event | When | Expression |
|---|---|---|
| `CONSENT_SHOWN` / `CONSENT_GIVEN` | consent step before the credit bureau check | `SEEING` / `HAPPY` |
| `PRIVATE_FIELD_FOCUS` / `PRIVATE_FIELD_BLUR` | see section 7 | `LOOKING_AWAY` / `IDLE` |
| `LIVE_PHOTO_STARTED` / `LIVE_PHOTO_DONE` | selfie step | eyes closed / `HAPPY` |
| `DOCUMENT_UPLOAD_STARTED` | any document chosen | `THINKING` |
| `DOCUMENT_UPLOAD_DONE` | file received | brief `HAPPY` |
| `DOCUMENT_REUPLOAD_NEEDED` | blurry, wrong file, password missing | brief `CONFUSED` → `IDLE` |
| `DOCUMENT_PASSWORD_NEEDED` | the PDF is locked | `SEEING`, then section 7 on focus |
| `CHECKLIST_COMPLETE` | every required document in | `WOW` → `HAPPY` |
| `QUOTE_LATER_CHOSEN` | customer has no dealer quotation yet (allowed — it is asked for before final approval) | `IDLE` (never sad) |
| `APPLICATION_SUBMITTED` | submitted | `WOW` → `HAPPY` |
| `STATUS_VIEWED` | customer opens "My application" | `SEEING` |

## 9. The one rule that matters most

The master prompt already says it; cercit repeats it because it is a lending product:

- The face **never** reflects a credit result. No happy face for "approved", no sad face for "not approved", no worried face for a risk flag.
- On the in-principle result, the final decision, and any "we could not approve this" screen, the character is **`IDLE`** (or hidden).
- `SAD` and `IRRITATED` are only for the customer's own actions (they cancelled, a technical error) — never for anything the lender decided.

## 10. Where it will live in cercit

| Page | Character |
|---|---|
| Apply (4 steps + documents + live photo) | yes — beside the form (desktop), top then corner companion (phone) |
| Document checklist / re-upload | yes |
| My application (status) | yes, `SEEING` / `IDLE` only |
| Customer sign-in | small, optional |
| Landing page hero | no — the hero already has the night-drive cockpit |
| Staff console (officers, admins) | **no** |

## 11. Copy for the demo page (cercit voice)

- Headline: "Meet your application assistant." (keep)
- Supporting line: "A little help while you apply for your car loan. It looks away when you type anything private."
- Caption examples under the character: "Upload your last 3 salary slips." · "That file is locked. Type its password — we don't keep it." · "All documents in. You can submit now."

## 12. What to hand back for fine-tuning in cercit

1. The `CarCharacter` folder described in section 5.
2. The expression list and the event → expression config as plain exports.
3. A short README: props, how to trigger an expression, how reduced motion is handled.
4. A demo page that shows every expression and every event (the master prompt's developer panel).

I will then move the folder into cercit, connect the events to the real apply flow, and tune timing, size and colours on the live pages.
