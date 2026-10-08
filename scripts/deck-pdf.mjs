// Makes a PDF of a slide deck in public/decks: one 1920x1080 page per slide.
// Run: node scripts/deck-pdf.mjs tech cercit-tech-deck.pdf
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [name = "tech", out = `cercit-${name}-deck.pdf`] = process.argv.slice(2);
const deck = resolve("public/decks", `${name}.html`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(deck).href);
await page.evaluate(() => document.fonts.ready);

// Print every slide at full size, one per page, without the deck's controls.
await page.addStyleTag({
  content: `
    html, body { overflow: visible !important; height: auto !important; background: #fff !important }
    #stage { position: static !important; transform: none !important; box-shadow: none !important; width: 1920px !important; height: auto !important }
    #stage section { position: relative !important; inset: auto !important; opacity: 1 !important; visibility: visible !important; break-after: page; page-break-after: always }
    .nav, #bar, #progress { display: none !important }
  `,
});
await page.pdf({ path: resolve("public/decks", out), width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
console.log(`wrote public/decks/${out} (${readFileSync(resolve("public/decks", out)).length} bytes)`);
