/*
 * Rend les cartons du spot promo (video/promo-cards.html) image par image :
 * les animations CSS sont figées puis avancées à la main, donc aucun saut
 * d'image, quelle que soit la vitesse de la machine.
 *
 *   npx tsx video/promo-render.ts             (1920×1080 → video/out/promo/cards/)
 *   npx tsx video/promo-render.ts vertical    (1080×1920, téléphone → video/out/promo/cards-v/)
 *
 * → <dossier>/<scène>/%04d.jpg, et <scène>.png pour les cadres fixes.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const VERTICAL = process.argv[2] === "vertical";
const OUT = path.join(__dirname, "out", "promo", VERTICAL ? "cards-v" : "cards");
const SIZE = VERTICAL ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const FORMAT = VERTICAL ? "&v=1" : "";
const PAGE = pathToFileURL(path.join(__dirname, "promo-cards.html")).href;
const FPS = 30;

/** Animated cards and their length in seconds (the voice-over sets it). */
const ANIMATED: Record<string, number> = { hook: 9.6, brand: 5.0, benefits: 4.6, end: 5.8 };

/** Static frames the screen recordings are laid into. */
const FRAMES = [
  { id: "f-dashboard", num: "1", title: "Tout voir d'un coup d'œil", sub: "Encaissé, reste à recouvrer, élèves en retard" },
  { id: "f-paiement", num: "2", title: "Encaisser en quelques secondes", sub: "Reçu PDF et confirmation WhatsApp au parent" },
  { id: "f-retards", num: "3", title: "Relancer sans effort", sub: "Retards repérés, rappels WhatsApp prêts à partir" },
  { id: "f-horsligne", num: "4", title: "Même sans internet", sub: "Tout se synchronise au retour du réseau" },
];

async function main() {
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: SIZE });

  for (const [scene, seconds] of Object.entries(ANIMATED)) {
    const dir = path.join(OUT, scene);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await page.goto(`${PAGE}?scene=${scene}${FORMAT}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    const frames = Math.round(seconds * FPS);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => document.getAnimations().forEach((a) => (a.currentTime = ms)), (i * 1000) / FPS);
      await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    }
    console.log(scene, frames, "images");
  }

  for (const f of FRAMES) {
    const q = new URLSearchParams({ scene: "frame", num: f.num, title: f.title, sub: f.sub });
    await page.goto(`${PAGE}?${q}${FORMAT}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `${f.id}.png`) });
    console.log(f.id);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
