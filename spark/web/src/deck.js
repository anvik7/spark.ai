/**
 * deck.js - Spark.AI pitch deck generator (browser-side, PptxGenJS)
 *
 * Call:  generateDeck()  -> triggers a .pptx download in the browser.
 *
 * Slide map:
 *  1. Cover
 *  2. Problem
 *  3. Solution
 *  4. How it works
 *  5. Pricing  <- Free / Pro / Ultra cards
 *  6. Traction / metrics placeholder
 *  7. Team placeholder
 *  8. Call to action
 */
import PptxGenJS from "pptxgenjs";

/* -- Brand tokens (mirrors index.css) --------------------------------- */
const MARIGOLD = "F59E0B";
const INK      = "0D1117";
const WHITE    = "FFFFFF";
const SURFACE  = "F8F9FA";
const PURPLE   = "7C3AED";
const PURPLE_L = "C4B5FD";
const PURPLE_XL= "F3E8FF";
const PURPLE_M = "E9D5FF";
const SLATE    = "57606A";

/* -- Slide dimensions: 10 x 5.625 in (16:9 widescreen) --------------- */
const W = 10, H = 5.625;

/* -- Helpers ---------------------------------------------------------- */
function bg(s, color = WHITE) {
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color }, line: { type: "none" } });
}

function accent(s, color = MARIGOLD) {
  s.addShape("rect", { x: 0, y: 0, w: 0.08, h: H, fill: { color }, line: { type: "none" } });
}

function eyebrow(s, text, y = 0.45) {
  s.addText(text.toUpperCase(), {
    x: 0.5, y, w: 9, h: 0.35,
    fontFace: "Arial", fontSize: 9, bold: true,
    color: MARIGOLD, charSpacing: 2, margin: 0,
  });
}

function heading(s, text, y = 0.75) {
  s.addText(text, {
    x: 0.5, y, w: 9, h: 0.75,
    fontFace: "Georgia", fontSize: 34, bold: true,
    color: INK, margin: 0,
  });
}

function body(s, text, y = 1.55, w = 8.5, color = SLATE) {
  s.addText(text, {
    x: 0.5, y, w, h: 2.5,
    fontFace: "Arial", fontSize: 13.5,
    color, valign: "top", margin: 0,
  });
}

/* ===================================================================
   SLIDE 1 - Cover
=================================================================== */
function addCover(pptx) {
  const s = pptx.addSlide();
  bg(s, INK);
  s.addShape("ellipse", { x: 6.5, y: -1, w: 5, h: 5, fill: { color: MARIGOLD, transparency: 82 }, line: { type: "none" } });
  s.addText("SPARK.AI", { x: 0.6, y: 1.4, w: 6, h: 0.55, fontFace: "Georgia", fontSize: 11, bold: true, color: MARIGOLD, charSpacing: 4, margin: 0 });
  s.addText("Your Second Brain,\nBuilt for Career Growth.", { x: 0.6, y: 1.9, w: 7.5, h: 1.8, fontFace: "Georgia", fontSize: 40, bold: true, color: WHITE, margin: 0 });
  s.addText("Capture . Learn . Review . Get Hired", { x: 0.6, y: 3.65, w: 7, h: 0.4, fontFace: "Arial", fontSize: 13, color: "9CA3AF", margin: 0 });
  s.addText("spark.ai", { x: 0.6, y: H - 0.55, w: 3, h: 0.35, fontFace: "Arial", fontSize: 10, color: "4B5563", margin: 0 });
}

/* ===================================================================
   SLIDE 2 - Problem
=================================================================== */
function addProblem(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s);
  eyebrow(s, "The Problem");
  heading(s, "Students drown in information,\nbut stay under-prepared.");
  const pts = [
    "100+ resources bookmarked, none revisited",
    "No system to connect what you know to what employers need",
    "Resumes that don't reflect real skills",
    "Hours wasted re-reading instead of building",
  ];
  pts.forEach((t, i) => {
    s.addText(t, { x: 0.7, y: 1.75 + i * 0.58, w: 8.8, h: 0.5, fontFace: "Arial", fontSize: 14.5, color: INK, margin: 0 });
  });
}

/* ===================================================================
   SLIDE 3 - Solution
=================================================================== */
function addSolution(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s, PURPLE);
  eyebrow(s, "The Solution");
  heading(s, "Spark turns scattered notes\ninto career-ready intelligence.");
  body(s, "Capture anything -> AI enriches it -> Spaced repetition surfaces it -> Career OS scores you against live market demand -> get hired faster.", 1.7);
}

/* ===================================================================
   SLIDE 4 - How it works
=================================================================== */
function addHowItWorks(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s);
  eyebrow(s, "How It Works");
  heading(s, "Five features. One flywheel.");
  const steps = [
    { label: "Capture",  desc: "Text, voice, PDF, link, image" },
    { label: "Enrich",   desc: "AI tags, summaries, difficulty" },
    { label: "Review",   desc: "SM-2 spaced repetition" },
    { label: "Connect",  desc: "Semantic search across notes" },
    { label: "Career",   desc: "Score + cover letter + plan" },
  ];
  const bw = 1.65, gap = 0.1, by = 2.0;
  steps.forEach(({ label, desc }, i) => {
    const bx = 0.4 + i * (bw + gap);
    s.addShape("roundRect", { x: bx, y: by, w: bw, h: 2.8, rectRadius: 0.15, fill: { color: SURFACE }, line: { color: "E5E7EB", pt: 1 } });
    s.addText(label, { x: bx, y: by + 0.55, w: bw, h: 0.4, fontFace: "Georgia", fontSize: 13, bold: true, color: INK, align: "center", margin: 0 });
    s.addText(desc,  { x: bx + 0.1, y: by + 1.05, w: bw - 0.2, h: 0.9, fontFace: "Arial", fontSize: 10.5, color: SLATE, align: "center", margin: 0 });
  });
}

/* ===================================================================
   SLIDE 5 - Pricing  (Free / Pro / Ultra)
=================================================================== */
function addPricing(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s, MARIGOLD);
  eyebrow(s, "Pricing");
  heading(s, "Start free. Grow on Pro. Go Ultra.");

  const y = 1.55, ch = 3.7;

  /* FREE card */
  const fx = 0.4, cw = 2.8;
  s.addShape("roundRect", { x: fx, y, w: cw, h: ch, rectRadius: 0.14, fill: { color: SURFACE }, line: { color: "E5E7EB", pt: 1.5 } });
  s.addText("Free",         { x: fx + 0.3, y: y + 0.28, w: cw - 0.6, h: 0.42, fontFace: "Georgia", fontSize: 18, bold: true, color: SLATE, margin: 0 });
  s.addText("Rs.0 / month", { x: fx + 0.3, y: y + 0.72, w: cw - 0.6, h: 0.6,  fontFace: "Georgia", fontSize: 26, bold: true, color: INK, margin: 0 });
  ["30 knowledge cards","AI auto-tagging","Spaced repetition","Semantic search"].forEach((t, i) => {
    s.addText(t, { x: fx + 0.3, y: y + 1.55 + i * 0.46, w: cw - 0.6, h: 0.42, fontFace: "Arial", fontSize: 12, color: SLATE, bullet: { code: "2713" }, margin: 0 });
  });

  /* PRO card */
  const px = fx + cw + 0.4, cw2 = 5.6;
  s.addShape("roundRect", { x: px, y, w: cw2, h: ch, rectRadius: 0.14, fill: { color: INK }, line: { type: "none" } });
  s.addText("Pro",            { x: px + 0.3, y: y + 0.28, w: cw2 - 0.6, h: 0.42, fontFace: "Georgia", fontSize: 18, bold: true, color: WHITE, margin: 0 });
  s.addText("Rs.299 / month", { x: px + 0.3, y: y + 0.72, w: cw2 - 0.6, h: 0.6,  fontFace: "Georgia", fontSize: 26, bold: true, color: WHITE, margin: 0 });
  ["Unlimited cards","Career readiness score","AI cover letter","Learning plan","Resume audit"].forEach((t, i) => {
    s.addText(t, { x: px + 0.3, y: y + 1.55 + i * 0.42, w: cw2 - 0.6, h: 0.38, fontFace: "Arial", fontSize: 12, color: "FEF9EC", bullet: { code: "2713" }, margin: 0 });
  });

  /* ULTRA card */
  const ux = px + cw2 + 0.4;
  s.addShape("roundRect", { x: ux, y, w: cw2, h: ch, rectRadius: 0.14, fill: { color: "#7C3AED" }, line: { type: "none" } });
  s.addText("Ultra", { x: ux + 0.35, y: y + 0.3, w: cw2 - 0.7, h: 0.5, fontFace: "Georgia", fontSize: 22, bold: true, color: "#C4B5FD", margin: 0 });
  s.addText("₹599 / month", { x: ux + 0.35, y: y + 0.85, w: cw2 - 0.7, h: 0.7, fontFace: "Georgia", fontSize: 34, bold: true, color: "#F3E8FF", margin: 0 });
  [
    "Everything in Pro, plus:",
    "2x faster AI responses",
    "Priority support (24h)",
    "Advanced export formats",
  ].forEach((t, i) => {
    s.addText(t, { x: ux + 0.35, y: y + 1.75 + i * 0.5, w: cw2 - 0.7, h: 0.45, fontFace: "Arial", fontSize: 14, color: "#E9D5FF", bullet: { code: "2713" }, margin: 0 });
  });
}

/* ===================================================================
   SLIDE 6 - Traction
=================================================================== */
function addTraction(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s, PURPLE);
  eyebrow(s, "Traction");
  heading(s, "Early signals.");
  const metrics = [
    { n: "--", l: "Beta users" }, { n: "--", l: "Cards created" },
    { n: "--", l: "Reviews completed" }, { n: "--", l: "Pro conversions" },
  ];
  const mw = 2.0, gap = 0.2;
  metrics.forEach(({ n, l }, i) => {
    const mx = 0.5 + i * (mw + gap);
    s.addShape("roundRect", { x: mx, y: 1.7, w: mw, h: 1.8, rectRadius: 0.14, fill: { color: SURFACE }, line: { color: "E5E7EB", pt: 1 } });
    s.addText(n, { x: mx, y: 1.9, w: mw, h: 0.75, fontFace: "Georgia", fontSize: 32, bold: true, color: INK, align: "center", margin: 0 });
    s.addText(l, { x: mx, y: 2.7, w: mw, h: 0.4,  fontFace: "Arial",   fontSize: 11, color: SLATE,  align: "center", margin: 0 });
  });
  s.addText("Fill in your live numbers before sending this deck.", { x: 0.5, y: 3.8, w: 9, h: 0.35, fontFace: "Arial", fontSize: 10, color: "9CA3AF", italics: true, margin: 0 });
}

/* ===================================================================
   SLIDE 7 - Team
=================================================================== */
function addTeam(pptx) {
  const s = pptx.addSlide();
  bg(s); accent(s);
  eyebrow(s, "Team");
  heading(s, "Who's building this.");
  body(s, "Add your team bios here - name, role, notable background (university, prior startup, open-source work). One line each.", 1.75);
}

/* ===================================================================
   SLIDE 8 - CTA / Ask
=================================================================== */
function addCTA(pptx) {
  const s = pptx.addSlide();
  bg(s, INK);
  s.addShape("ellipse", { x: -1, y: 3.5, w: 4, h: 4, fill: { color: PURPLE, transparency: 80 }, line: { type: "none" } });
  s.addText("SPARK.AI", { x: 0.6, y: 1.2, w: 8, h: 0.45, fontFace: "Georgia", fontSize: 10, bold: true, color: MARIGOLD, charSpacing: 4, margin: 0 });
  s.addText("Let's build the\nsecond brain for India.", { x: 0.6, y: 1.6, w: 8.5, h: 1.8, fontFace: "Georgia", fontSize: 38, bold: true, color: WHITE, margin: 0 });
  s.addText("hello@spark.ai  .  spark.ai", { x: 0.6, y: 3.55, w: 6, h: 0.4, fontFace: "Arial", fontSize: 13, color: "9CA3AF", margin: 0 });
}

/* ===================================================================
   Main export
=================================================================== */
export async function generateDeck() {
  const pptx = new PptxGenJS();
  pptx.layout  = "LAYOUT_WIDE";
  pptx.author  = "Spark.AI";
  pptx.company = "Spark.AI";
  pptx.subject = "Spark.AI Pitch Deck";
  pptx.title   = "Spark.AI - Your Second Brain";

  addCover(pptx);
  addProblem(pptx);
  addSolution(pptx);
  addHowItWorks(pptx);
  addPricing(pptx);
  addTraction(pptx);
  addTeam(pptx);
  addCTA(pptx);

  await pptx.writeFile({ fileName: "Spark-AI-Pitch-Deck.pptx" });
}
