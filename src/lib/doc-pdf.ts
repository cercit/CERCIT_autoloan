import logoUrl from "@/assets/brand/logo-horizontal-light.png";

import { supabase, isSupabaseConfigured } from "./supabase";

// cercit's document maker. Every PDF the app hands out goes through here, so
// they share one letterhead (the real logo), real selectable text, A4 with
// 20–22 mm margins, page numbers, and the page-fit loop from tools/printkit:
//
//   render at house density (10.5 pt / 22 mm); if the last page is sparse, step
//   one notch tighter and keep the result only if it sheds a page. Stop at
//   9.7 pt / 20 mm, about 8% off base type, the point where a reader starts to
//   notice. Nothing is squashed past that, and there are no forced page breaks
//   or cover pages (house PDF rules).
//
// The standard PDF font has no ₹ glyph, so amounts are written "Rs" (lib/format
// already does this).

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string; bold?: boolean; small?: boolean; muted?: boolean }
  | { kind: "kv"; rows: [string, string][] }
  | {
      kind: "table";
      head: string[];
      rows: string[][];
      widths?: number[];
      align?: ("l" | "r")[];
      small?: boolean;
    }
  | { kind: "list"; items: string[]; ordered?: boolean; small?: boolean }
  | { kind: "note"; title?: string; text: string }
  | { kind: "sign"; parties: { label: string; name: string; lines?: string[] }[] }
  | { kind: "space"; mm: number };

export interface OrgInfo {
  legal_name: string;
  cin: string;
  rbi_registration_no: string;
  gstin: string;
  registered_address: string;
  support_email: string;
  support_phone: string;
  grievance_officer_name: string;
  grievance_officer_email: string;
  grievance_officer_phone: string;
}

export interface DocSpec {
  title: string; // shown in the heading and on following pages
  ref: string; // document reference, printed in the footer
  date: Date;
  addressee?: string[]; // "To" block lines
  subject?: string;
  blocks: Block[];
}

// Fallback letterhead when the organisation settings can't be read (sql/041).
export const DEMO_ORG: OrgInfo = {
  legal_name: "cercit Vehicle Finance Ltd",
  cin: "U65923TN2024PLC123456",
  rbi_registration_no: "N-13.02345",
  gstin: "33AABCC1234F1Z5",
  registered_address: "4th Floor, Sterling Towers, Anna Salai, Chennai 600002",
  support_email: "loans@cercit.in",
  support_phone: "+91 44 2852 0000",
  grievance_officer_name: "K. Venkataraman",
  grievance_officer_email: "grievance@cercit.in",
  grievance_officer_phone: "+91 44 2852 0099",
};

let orgPromise: Promise<OrgInfo> | null = null;
export function getOrg(): Promise<OrgInfo> {
  if (!orgPromise) {
    orgPromise = (async () => {
      if (!isSupabaseConfigured) return DEMO_ORG;
      const { data } = await supabase.rpc("fn_public_org_info");
      const o = (data ?? {}) as Partial<OrgInfo> & { company_name?: string };
      const pick = <K extends keyof OrgInfo>(k: K) => (o[k] ? String(o[k]) : DEMO_ORG[k]);
      return {
        legal_name: o.legal_name || o.company_name || DEMO_ORG.legal_name,
        cin: pick("cin"),
        rbi_registration_no: pick("rbi_registration_no"),
        gstin: pick("gstin"),
        registered_address: pick("registered_address"),
        support_email: pick("support_email"),
        support_phone: pick("support_phone"),
        grievance_officer_name: pick("grievance_officer_name"),
        grievance_officer_email: pick("grievance_officer_email"),
        grievance_officer_phone: pick("grievance_officer_phone"),
      };
    })().catch(() => DEMO_ORG);
  }
  return orgPromise;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface Level {
  size: number; // body pt
  margin: number; // mm
}
// House density first, then one notch at a time to the floor.
export const LEVELS: Level[] = [
  { size: 10.5, margin: 22 },
  { size: 10.2, margin: 21 },
  { size: 9.9, margin: 20.5 },
  { size: 9.7, margin: 20 },
];

const INK = [16, 27, 46] as const; // #101B2E
const MUTED = [91, 107, 130] as const; // #5B6B82
const ACCENT = [47, 95, 208] as const; // #2F5FD0
const RULE = [220, 226, 236] as const; // #DCE2EC
const WASH = [244, 246, 250] as const; // #F4F6FA
const PT = 0.3528; // mm per point
const LINE = 1.38; // line height factor
const PAGE_W = 210;
const PAGE_H = 297;
const HEADER_FIRST = 30; // mm from the top where the body starts on page 1
const HEADER_NEXT = 20;
const FOOTER = 16; // mm kept for the footer

/** The standard PDF font covers WinAnsi only; swap the few characters it can't draw. */
const ZERO_WIDTH = new RegExp("[" + String.fromCharCode(0x200b, 0x2060) + "]", "g");

export function pdfText(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs ")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/✓/g, "Yes")
    .replace(ZERO_WIDTH, "");
}

type Pdf = import("jspdf").jsPDF;

interface Ctx {
  pdf: Pdf;
  level: Level;
  y: number;
  page: number;
  bottoms: number[]; // how far down the live area content reached, per page
  spec: DocSpec;
  org: OrgInfo;
  logo: string | null;
}

const width = (c: Ctx) => PAGE_W - 2 * c.level.margin;
const bottomLimit = () => PAGE_H - FOOTER;
const lh = (size: number) => size * PT * LINE;

function setFont(
  c: Ctx,
  size: number,
  style: "normal" | "bold" = "normal",
  color: readonly number[] = INK,
) {
  c.pdf.setFont("helvetica", style);
  c.pdf.setFontSize(size);
  c.pdf.setTextColor(color[0]!, color[1]!, color[2]!);
}

function newPage(c: Ctx) {
  c.bottoms[c.page - 1] = Math.max(c.bottoms[c.page - 1] ?? 0, c.y);
  c.pdf.addPage();
  c.page += 1;
  drawHeader(c, false);
  c.y = HEADER_NEXT;
}

function need(c: Ctx, mm: number) {
  if (c.y + mm > bottomLimit()) newPage(c);
}

function drawHeader(c: Ctx, first: boolean) {
  const m = c.level.margin;
  if (first) {
    if (c.logo) c.pdf.addImage(c.logo, "PNG", m, 10, 38, 38 / 4.162);
    setFont(c, 7.5, "bold");
    c.pdf.text(pdfText(c.org.legal_name), PAGE_W - m, 12, { align: "right" });
    setFont(c, 6.8, "normal", MUTED);
    c.pdf.text(
      pdfText(`CIN ${c.org.cin} · RBI Reg. No. ${c.org.rbi_registration_no}`),
      PAGE_W - m,
      15.5,
      { align: "right" },
    );
    c.pdf.text(pdfText(c.org.registered_address), PAGE_W - m, 18.8, { align: "right" });
    c.pdf.text(pdfText(`${c.org.support_phone} · ${c.org.support_email}`), PAGE_W - m, 22.1, {
      align: "right",
    });
    c.pdf.setDrawColor(INK[0], INK[1], INK[2]);
    c.pdf.setLineWidth(0.5);
    c.pdf.line(m, 25, PAGE_W - m, 25);
  } else {
    if (c.logo) c.pdf.addImage(c.logo, "PNG", m, 8, 22, 22 / 4.162);
    setFont(c, 7.5, "normal", MUTED);
    c.pdf.text(pdfText(c.spec.title), PAGE_W - m, 11.5, { align: "right" });
    c.pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
    c.pdf.setLineWidth(0.3);
    c.pdf.line(m, 15, PAGE_W - m, 15);
  }
}

function drawFooters(c: Ctx) {
  const total = c.pdf.getNumberOfPages();
  const m = c.level.margin;
  for (let p = 1; p <= total; p++) {
    c.pdf.setPage(p);
    c.pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
    c.pdf.setLineWidth(0.3);
    c.pdf.line(m, PAGE_H - 13.5, PAGE_W - m, PAGE_H - 13.5);
    setFont(c, 6.8, "normal", MUTED);
    c.pdf.text(pdfText(`${c.spec.ref} · ${fmtDate(c.spec.date)}`), m, PAGE_H - 10);
    c.pdf.text(`Page ${p} of ${total}`, PAGE_W - m, PAGE_H - 10, { align: "right" });
    setFont(c, 6.2, "normal", MUTED);
    c.pdf.text(
      pdfText(`${c.org.legal_name} · product demo on synthetic data, not a real loan document`),
      m,
      PAGE_H - 6.8,
    );
  }
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function lines(c: Ctx, text: string, w: number): string[] {
  return c.pdf.splitTextToSize(pdfText(text), w) as string[];
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function heading(c: Ctx, text: string) {
  const size = c.level.size + 1.5;
  // Keep with next: the heading plus three lines of what follows.
  need(c, lh(size) + 3 * lh(c.level.size) + 3);
  c.y += 2.2;
  setFont(c, size, "bold", INK);
  c.pdf.text(pdfText(text), c.level.margin, c.y + size * PT);
  c.y += lh(size) + 0.8;
}

function para(c: Ctx, b: Extract<Block, { kind: "para" }>) {
  const size = b.small ? c.level.size - 1 : c.level.size;
  setFont(c, size, b.bold ? "bold" : "normal", b.muted ? MUTED : INK);
  const ls = lines(c, b.text, width(c));
  for (const l of ls) {
    need(c, lh(size));
    setFont(c, size, b.bold ? "bold" : "normal", b.muted ? MUTED : INK);
    c.pdf.text(l, c.level.margin, c.y + size * PT);
    c.y += lh(size);
  }
  c.y += size * PT * 0.55;
}

function listBlock(c: Ctx, b: Extract<Block, { kind: "list" }>) {
  const size = b.small ? c.level.size - 0.8 : c.level.size;
  const indent = 5;
  b.items.forEach((item, i) => {
    setFont(c, size);
    const ls = lines(c, item, width(c) - indent);
    ls.forEach((l, k) => {
      need(c, lh(size));
      setFont(c, size);
      if (k === 0) c.pdf.text(b.ordered ? `${i + 1}.` : "•", c.level.margin + 0.5, c.y + size * PT);
      c.pdf.text(l, c.level.margin + indent, c.y + size * PT);
      c.y += lh(size);
    });
    c.y += 0.6;
  });
  c.y += size * PT * 0.4;
}

function rowHeight(c: Ctx, cells: string[], widths: number[], size: number) {
  return Math.max(...cells.map((t, i) => lines(c, t, widths[i]! - 3).length)) * lh(size) + 2.2;
}

function drawRow(
  c: Ctx,
  cells: string[],
  widths: number[],
  size: number,
  opts: {
    bold?: boolean[] | undefined;
    align?: ("l" | "r")[] | undefined;
    fill?: readonly number[] | undefined;
    colors?: (readonly number[])[] | undefined;
  },
) {
  const h = rowHeight(c, cells, widths, size);
  let x = c.level.margin;
  if (opts.fill) {
    c.pdf.setFillColor(opts.fill[0]!, opts.fill[1]!, opts.fill[2]!);
    c.pdf.rect(
      x,
      c.y,
      widths.reduce((a, b) => a + b, 0),
      h,
      "F",
    );
  }
  cells.forEach((t, i) => {
    setFont(c, size, opts.bold?.[i] ? "bold" : "normal", opts.colors?.[i] ?? INK);
    const w = widths[i]!;
    const ls = lines(c, t, w - 3);
    ls.forEach((l, k) => {
      const ty = c.y + 1.1 + size * PT + k * lh(size);
      if (opts.align?.[i] === "r") c.pdf.text(l, x + w - 1.5, ty, { align: "right" });
      else c.pdf.text(l, x + 1.5, ty);
    });
    x += w;
  });
  c.pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
  c.pdf.setLineWidth(0.25);
  c.pdf.line(c.level.margin, c.y + h, c.level.margin + widths.reduce((a, b) => a + b, 0), c.y + h);
  c.y += h;
}

function kv(c: Ctx, b: Extract<Block, { kind: "kv" }>) {
  const size = c.level.size - 0.3;
  const w = width(c);
  const widths = [w * 0.42, w * 0.58];
  for (const [k, v] of b.rows) {
    need(c, rowHeight(c, [k, v], widths, size));
    drawRow(c, [k, v], widths, size, { colors: [MUTED, INK] });
  }
  c.y += 2.5;
}

function table(c: Ctx, b: Extract<Block, { kind: "table" }>) {
  const size = b.small ? c.level.size - 1.2 : c.level.size - 0.5;
  const w = width(c);
  const shares = b.widths ?? b.head.map(() => 1);
  const total = shares.reduce((a, x) => a + x, 0);
  const widths = shares.map((s) => (s / total) * w);
  const head = () =>
    drawRow(c, b.head, widths, size, { bold: b.head.map(() => true), align: b.align, fill: WASH });
  need(c, rowHeight(c, b.head, widths, size) + rowHeight(c, b.rows[0] ?? [""], widths, size));
  head();
  for (const r of b.rows) {
    const h = rowHeight(c, r, widths, size);
    if (c.y + h > bottomLimit()) {
      newPage(c);
      head(); // repeat the header row on the new page
    }
    drawRow(c, r, widths, size, { align: b.align });
  }
  c.y += 3;
}

function note(c: Ctx, b: Extract<Block, { kind: "note" }>) {
  const size = c.level.size - 0.6;
  const pad = 3;
  setFont(c, size);
  const body = lines(c, b.text, width(c) - 2 * pad);
  const h = (body.length + (b.title ? 1 : 0)) * lh(size) + 2 * pad;
  if (h < bottomLimit() - HEADER_NEXT) need(c, h + 2);
  c.pdf.setFillColor(WASH[0], WASH[1], WASH[2]);
  c.pdf.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  c.pdf.setLineWidth(0.6);
  c.pdf.rect(c.level.margin, c.y, width(c), h, "F");
  c.pdf.line(c.level.margin, c.y, c.level.margin, c.y + h);
  let ty = c.y + pad;
  if (b.title) {
    setFont(c, size, "bold");
    c.pdf.text(pdfText(b.title), c.level.margin + pad, ty + size * PT);
    ty += lh(size);
  }
  setFont(c, size);
  for (const l of body) {
    c.pdf.text(l, c.level.margin + pad, ty + size * PT);
    ty += lh(size);
  }
  c.y += h + 3;
}

function sign(c: Ctx, b: Extract<Block, { kind: "sign" }>) {
  const size = c.level.size - 0.8;
  const n = b.parties.length;
  const gap = 8;
  const w = (width(c) - gap * (n - 1)) / n;
  const tallest = Math.max(...b.parties.map((p) => (p.lines?.length ?? 0) + 2)) * lh(size) + 14;
  need(c, tallest);
  b.parties.forEach((p, i) => {
    const x = c.level.margin + i * (w + gap);
    setFont(c, size, "bold");
    c.pdf.text(pdfText(p.label), x, c.y + size * PT);
    c.pdf.setDrawColor(MUTED[0], MUTED[1], MUTED[2]);
    c.pdf.setLineWidth(0.3);
    c.pdf.line(x, c.y + 12, x + w, c.y + 12);
    setFont(c, size, "bold");
    c.pdf.text(pdfText(p.name), x, c.y + 12 + lh(size));
    setFont(c, size - 0.6, "normal", MUTED);
    (p.lines ?? []).forEach((l, k) => {
      const ls = lines(c, l, w);
      ls.forEach((t, j) => c.pdf.text(t, x, c.y + 12 + lh(size) * (2 + k) + j * lh(size - 0.6)));
    });
  });
  c.y += tallest;
}

function render(
  spec: DocSpec,
  org: OrgInfo,
  logo: string | null,
  jsPDF: typeof import("jspdf").jsPDF,
  level: Level,
) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: pdfText(spec.title),
    subject: spec.ref,
    author: org.legal_name,
    creator: "cercit",
  });
  const c: Ctx = { pdf, level, y: HEADER_FIRST, page: 1, bottoms: [], spec, org, logo };
  drawHeader(c, true);

  // Title, reference and date, addressee, subject.
  setFont(c, level.size + 4, "bold", INK);
  c.pdf.text(pdfText(spec.title), level.margin, c.y + (level.size + 4) * PT);
  c.y += lh(level.size + 4) + 1;
  setFont(c, level.size - 1, "normal", MUTED);
  c.pdf.text(pdfText(`Ref. ${spec.ref}`), level.margin, c.y + (level.size - 1) * PT);
  c.pdf.text(
    pdfText(`Date: ${fmtDate(spec.date)}`),
    PAGE_W - level.margin,
    c.y + (level.size - 1) * PT,
    { align: "right" },
  );
  c.y += lh(level.size - 1) + 3;
  if (spec.addressee?.length) {
    para(c, { kind: "para", text: "To," });
    c.y -= level.size * PT * 0.55;
    spec.addressee.forEach((l, i) => {
      setFont(c, level.size, i === 0 ? "bold" : "normal", i === 0 ? INK : MUTED);
      for (const t of lines(c, l, width(c))) {
        c.pdf.text(t, level.margin, c.y + level.size * PT);
        c.y += lh(level.size);
      }
    });
    c.y += 2.5;
  }
  if (spec.subject) para(c, { kind: "para", text: `Subject: ${spec.subject}`, bold: true });

  for (const b of spec.blocks) {
    if (b.kind === "heading") heading(c, b.text);
    else if (b.kind === "para") para(c, b);
    else if (b.kind === "kv") kv(c, b);
    else if (b.kind === "table") table(c, b);
    else if (b.kind === "list") listBlock(c, b);
    else if (b.kind === "note") note(c, b);
    else if (b.kind === "sign") sign(c, b);
    else if (b.kind === "space") c.y += b.mm;
  }
  c.bottoms[c.page - 1] = Math.max(c.bottoms[c.page - 1] ?? 0, c.y);
  drawFooters(c);
  const live = bottomLimit() - HEADER_NEXT;
  const fill = c.bottoms.map((b, i) =>
    Math.min(1, (b - (i === 0 ? HEADER_FIRST : HEADER_NEXT)) / live),
  );
  return { pdf, pages: pdf.getNumberOfPages(), fill };
}

let logoData: Promise<string | null> | null = null;
function loadLogo(): Promise<string | null> {
  if (!logoData) {
    logoData = fetch(logoUrl)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string | null>((ok) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result));
            fr.onerror = () => ok(null);
            fr.readAsDataURL(b);
          }),
      )
      .catch(() => null);
  }
  return logoData;
}

export interface BuiltPdf {
  pdf: Pdf;
  pages: number;
  fill: number[]; // per page, 0..1
  level: Level;
}

/** Renders with the page-fit loop and returns the chosen version. */
export async function buildPdf(spec: DocSpec): Promise<BuiltPdf> {
  const [{ jsPDF }, org, logo] = await Promise.all([import("jspdf"), getOrg(), loadLogo()]);
  const base = { ...render(spec, org, logo, jsPDF, LEVELS[0]!), level: LEVELS[0]! };
  const lastFill = base.fill[base.fill.length - 1] ?? 1;
  if (base.pages === 1 || lastFill >= 0.35) return base;
  for (const level of LEVELS.slice(1)) {
    const tighter = render(spec, org, logo, jsPDF, level);
    if (tighter.pages < base.pages) return { ...tighter, level };
  }
  return base; // could not shed the page inside the budget: keep house density
}

export async function downloadPdf(spec: DocSpec, filename: string): Promise<void> {
  const built = await buildPdf(spec);
  built.pdf.save(filename);
}

export async function pdfBlobUrl(spec: DocSpec): Promise<string> {
  const built = await buildPdf(spec);
  return URL.createObjectURL(built.pdf.output("blob"));
}
