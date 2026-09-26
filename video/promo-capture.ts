/*
 * Plans de l'application pour le spot promo d'une minute : même compte de
 * démonstration que tour.ts, mais sans sous-titres ni inscription. Chaque plan
 * est repéré dans video/out/promo/marks.json ; le montage les découpe ensuite.
 *
 *   npm run build && npm run demo:reset
 *   npx tsx video/promo-capture.ts            (écran d'ordinateur → app.webm)
 *   FFMPEG=<ffmpeg.exe> npx tsx video/promo-capture.ts mobile
 *                                            (écran de téléphone → app-mobile.mp4)
 *   npm run demo:reset          (chaque tournage encaisse un paiement)
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync, execFileSync, type ChildProcess } from "node:child_process";
import { chromium, type Locator, type Page } from "playwright";

const OUT = path.join(__dirname, "out", "promo");
/** Phone layout: the app's own mobile screens (menu drawer), for the vertical cut. */
const MOBILE = process.argv[2] === "mobile";
const NAME = MOBILE ? "app-mobile" : "app";
const SERVER_PORT = 3101;
const PROXY_PORT = 3100;
const BASE = `http://127.0.0.1:${PROXY_PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mode: "pass" | "refuse" = "pass";
const sockets = new Set<net.Socket>();
const proxy = net.createServer((client) => {
  sockets.add(client);
  client.on("close", () => sockets.delete(client));
  client.on("error", () => {});
  if (mode === "refuse") return void client.destroy();
  const upstream = net.connect(SERVER_PORT, "127.0.0.1");
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});

let server: ChildProcess | null = null;
async function startServer() {
  server = spawn("npm.cmd", ["run", "start", "--", "-p", String(SERVER_PORT)], { shell: true, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${SERVER_PORT}/connexion`)).ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("server down");
}

/** A visible cursor only: the promo puts its own titles on at editing time. */
const CURSOR = `
(() => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(15,122,61,.35);border:2px solid #0F7A3D;pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
    document.documentElement.appendChild(c);
    const pos = sessionStorage.getItem("__cursor");
    if (pos) { const [x, y] = pos.split(","); c.style.left = x + "px"; c.style.top = y + "px"; }
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px";
      sessionStorage.setItem("__cursor", e.clientX + "," + e.clientY); }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  setInterval(install, 300);
})();
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await startServer();
  proxy.listen(PROXY_PORT);

  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const context = await browser.newContext(
    MOBILE
      ? {
          // No recordVideo: it films CSS pixels, so a 414 px phone would come
          // out 414 px wide. The screencast below films device pixels (×2).
          viewport: { width: 414, height: 896 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          locale: "fr-FR",
        }
      : {
          viewport: { width: 1280, height: 720 },
          recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
          locale: "fr-FR",
        }
  );
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const t0 = Date.now();
  const screencast = MOBILE ? await startScreencast(page, t0) : null;
  const marks: { id: string; start: number; end: number }[] = [];

  async function point(target: Locator) {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const box = await target.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
    await sleep(250);
  }
  async function click(target: Locator) {
    await point(target);
    await target.click();
    await sleep(350);
  }
  async function smoothScroll(dy: number, ms = 1600) {
    await page.evaluate(`new Promise((done) => {
      const start = scrollY, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ${ms});
        scrollTo(0, start + ${dy} * (0.5 - Math.cos(Math.PI * k) / 2));
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    })`);
  }
  async function dismissAlerts() {
    const later = page.getByRole("button", { name: "Plus tard" });
    if (await later.isVisible().catch(() => false)) await later.click();
  }
  const nav = (name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) }).first();
  /** Goes to a section: on a phone the links sit in the drawer behind the menu button. */
  async function go(name: string) {
    if (MOBILE) {
      await click(page.getByRole("button", { name: "Ouvrir le menu" }));
      await sleep(400);
    }
    await click(nav(name));
  }

  /** One shot: its span in the recording is what the edit may use. */
  async function shot(id: string, actions: () => Promise<unknown>) {
    const start = (Date.now() - t0) / 1000;
    try {
      await actions();
    } catch (err) {
      await page.screenshot({ path: path.join(OUT, `echec-${id}.png`) }).catch(() => {});
      throw err;
    }
    marks.push({ id, start, end: (Date.now() - t0) / 1000 });
    console.log(`plan ${id} ${start.toFixed(1)}s → ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator('input[name="identifier"]').fill("demo@bangre.bf");
  await page.locator('input[name="password"]').fill("Bangre2026");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/tableau-de-bord", { timeout: 20000 });
  await dismissAlerts();
  // Wait for the offline copy so the sidebar already says it is ready.
  await page.getByText("Prêt à fonctionner hors ligne").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.mouse.move(700, 400);
  await sleep(1000);

  await shot("dashboard", async () => {
    await sleep(600);
    for (const label of ["Total encaissé", "Reste à recouvrer", "Élèves en retard"]) {
      await point(page.getByText(label, { exact: true }).first());
      await sleep(900);
    }
    await smoothScroll(260, 1500);
    await sleep(1200);
  });

  await shot("paiement", async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await go("Élèves");
    await page.waitForURL("**/eleves");
    const search = page.getByPlaceholder(/Rechercher par nom/);
    await click(search);
    await search.pressSequentially("KABORÉ", { delay: 45 });
    await page.keyboard.press("Enter");
    await sleep(1200);
    await click(page.locator("tr", { hasText: "Moussa" }).filter({ hasText: "4e A" }).first());
    await page.waitForURL(/\/eleves\/[^/]+$/);
    await sleep(900);
    await click(page.getByRole("button", { name: "Enregistrer un paiement" }).first());
    await sleep(1000);
    await click(page.locator('button:has-text("Échéance")').first());
    await sleep(600);
    await click(page.getByRole("button", { name: /Valider et générer le reçu/ }));
    await page.getByText(/Reçu N° /).first().waitFor({ timeout: 20000 });
    await sleep(800);
    const wa = page.getByText("Confirmer par WhatsApp").first();
    if (await wa.isVisible().catch(() => false)) await point(wa);
    await sleep(1800);
    // Exact and visible: on a phone the menu's "Fermer le menu" and an
    // off-screen copy of the receipt also match a plain "Fermer".
    await click(page.getByRole("button", { name: "Fermer", exact: true }).filter({ visible: true }).first());
  });

  await shot("retards", async () => {
    await go("Retards de paiement");
    await page.waitForURL("**/retards");
    await sleep(1200);
    const boxes = page.locator('tbody input[type="checkbox"]');
    await click(boxes.nth(0));
    await click(boxes.nth(1));
    await click(boxes.nth(3));
    await click(page.getByRole("button", { name: "Rappel WhatsApp" }).first());
    await page.getByText("Rappels à envoyer").first().waitFor({ timeout: 15000 });
    await sleep(700);
    await click(page.getByRole("button", { name: "Modifier" }).first());
    const text = page.locator("textarea").first();
    if (await text.isVisible().catch(() => false)) await point(text);
    await sleep(2500);
    await click(page.getByRole("button", { name: "Annuler" }).first());
    await click(page.getByRole("button", { name: "Terminé" }).first());
  });

  await shot("horsligne", async () => {
    if (MOBILE) {
      await click(page.getByRole("button", { name: "Ouvrir le menu" }));
      await sleep(400);
    }
    await point(page.getByText("Prêt à fonctionner hors ligne").first());
    await sleep(1200);
    mode = "refuse";
    for (const s of sockets) s.destroy();
    await context.setOffline(true);
    await sleep(400);
    await click(nav("Tableau de bord"));
    await page.getByText("Hors ligne", { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(700);
    await point(page.getByText("Hors ligne", { exact: true }).nth(1));
    await sleep(1500);
    await go("Élèves");
    await sleep(2000);
  });

  fs.writeFileSync(path.join(OUT, `${MOBILE ? "marks-mobile" : "marks"}.json`), JSON.stringify(marks, null, 1));
  if (screencast) {
    await screencast.stop();
    await context.close();
  } else {
    const video = page.video();
    await context.close();
    const file = await video?.path();
    if (file) fs.renameSync(file, path.join(OUT, `${NAME}.webm`));
    console.log("vidéo", path.join(OUT, `${NAME}.webm`));
  }
  await browser.close();
  proxy.close();
}

/**
 * Films the page through Chrome's screencast, at device pixels. Frames only
 * arrive when something changes, so each one is held until the next: the
 * ffmpeg concat list carries those durations, and the clock starts at t0 like
 * the shot marks.
 */
async function startScreencast(page: Page, t0: number) {
  const dir = path.join(OUT, "frames-mobile");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames: { file: string; at: number }[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, at: (f.metadata.timestamp ?? Date.now() / 1000) - t0 / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 828, maxHeight: 1792 });

  return {
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      const end = (Date.now() - t0) / 1000;
      const lines = ["ffconcat version 1.0"];
      frames.forEach((f, i) => {
        const from = i === 0 ? 0 : f.at;
        const to = frames[i + 1]?.at ?? end;
        lines.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`);
      });
      // The concat demuxer ignores the last entry's duration: repeat the image.
      if (frames.length) lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
      fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
      const out = path.join(OUT, `${NAME}.mp4`);
      execFileSync(
        process.env.FFMPEG ?? "ffmpeg",
        ["-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
          "-vf", "fps=30,scale=828:1792,format=yuv420p", "-c:v", process.env.VCODEC ?? "libx264", "-b:v", "12M", out],
        { stdio: "inherit" }
      );
      console.log("vidéo", out, `(${frames.length} images)`);
    },
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server?.pid) execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    setTimeout(() => process.exit(), 500);
  });
