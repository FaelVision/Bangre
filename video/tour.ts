/*
 * Vidéo de présentation de Bangre, filmée sur le compte de démonstration local.
 *
 * 1. npm run build && npm run demo:reset
 * 2. FFMPEG=<ffmpeg.exe> python video/voix.py                    (voix off naturelle → video/out/audio ;
 *    sans réseau : powershell -ExecutionPolicy Bypass -File video/tts.ps1, voix Windows)
 * 3. FFMPEG=<chemin de ffmpeg.exe> npx tsx video/tour.ts           (tournage + montage)
 * 4. npm run demo:reset                                           (le tournage inscrit un élève et encaisse)
 *
 * Résultat : video/out/Bangre-presentation.mp4. Le texte dit par la voix off
 * et affiché en sous-titres est dans video/narration.json. Playwright a
 * besoin de son module vidéo (`npx playwright install ffmpeg`) ; si le
 * téléchargement est bloqué, copier un ffmpeg.exe à l'emplacement qu'il
 * indique dans son message d'erreur.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync, execFileSync, type ChildProcess } from "node:child_process";
import { chromium, type Locator } from "playwright";

const OUT = path.resolve(process.argv[2] ?? path.join(__dirname, "out"));
const SERVER_PORT = 3101;
const PROXY_PORT = 3100;
const BASE = `http://127.0.0.1:${PROXY_PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const narration: { id: string; text: string }[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "narration.json"), "utf8")
);

/** Length of a PCM WAV file, in seconds, read from its header. */
function wavSeconds(file: string) {
  const buf = fs.readFileSync(file);
  const byteRate = buf.readUInt32LE(28);
  let offset = 12;
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return size / byteRate;
    offset += 8 + size;
  }
  return 5;
}
const durations: Record<string, number> = Object.fromEntries(
  narration.map((n) => [n.id, wavSeconds(path.join(OUT, "audio", `${n.id}.wav`))])
);

// --- proxy: lets the tour cut the network for the offline part ---------------
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

// --- overlay: visible cursor, subtitles, title cards ---------------------------
const OVERLAY = `
(() => {
  const install = () => {
    if (document.getElementById("__tour")) return;
    const root = document.createElement("div");
    root.id = "__tour";
    root.innerHTML = \`
      <style>
        #__cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
          background:rgba(15,122,61,.35);border:2px solid #0F7A3D;pointer-events:none;transition:transform .12s;left:-50px;top:-50px}
        #__cursor.down{transform:scale(.7);background:rgba(15,122,61,.6)}
        #__caption{position:fixed;z-index:2147483646;left:50%;bottom:26px;transform:translateX(-50%);max-width:1000px;width:max-content;
          background:rgba(20,16,12,.84);color:#fff;font:500 19px/1.45 system-ui,sans-serif;padding:12px 22px;border-radius:12px;
          text-align:center;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.25)}
        #__caption:empty{display:none}
        #__card{position:fixed;inset:0;z-index:2147483645;background:linear-gradient(135deg,#0F7A3D,#0a5a2c);display:none;
          align-items:center;justify-content:center;flex-direction:column;color:#fff;font-family:system-ui,sans-serif}
        #__card.on{display:flex}
        #__card img{width:110px;height:110px;border-radius:24px;background:#fff;padding:8px}
        #__card h1{font-size:54px;margin:26px 0 8px;letter-spacing:-.02em}
        #__card p{font-size:23px;opacity:.9;margin:0}
      </style>
      <div id="__card"><img src="/logo-bangre.jpg" alt=""><h1></h1><p></p></div>
      <div id="__caption"></div><div id="__cursor"></div>\`;
    document.documentElement.appendChild(root);
    const cur = document.getElementById("__cursor");
    const pos = sessionStorage.getItem("__cursor");
    if (pos) { const [x, y] = pos.split(","); cur.style.left = x + "px"; cur.style.top = y + "px"; }
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px";
      sessionStorage.setItem("__cursor", e.clientX + "," + e.clientY); }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
    window.__tourCaption = (t) => { sessionStorage.setItem("__caption", t); document.getElementById("__caption").textContent = t; };
    window.__tourCard = (title, sub) => { const c = document.getElementById("__card");
      sessionStorage.setItem("__card", title ? JSON.stringify([title, sub]) : "");
      if (!title) return c.classList.remove("on"); c.querySelector("h1").textContent = title; c.querySelector("p").textContent = sub; c.classList.add("on"); };
    window.__tourCaption(sessionStorage.getItem("__caption") || "");
    const card = sessionStorage.getItem("__card"); if (card) window.__tourCard(...JSON.parse(card));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  // Next may re-render <body>: put the overlay back if it disappears.
  setInterval(install, 300);
})();
`;

/** What the overlay script adds to the page. */
type TourWindow = { __tourCaption?: (t: string) => void; __tourCard?: (title: string, sub: string) => void };

async function main() {
  await startServer();
  proxy.listen(PROXY_PORT);

  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
    locale: "fr-FR",
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks: { id: string; at: number }[] = [];

  const caption = (t: string) => page.evaluate((t) => (window as unknown as TourWindow).__tourCaption?.(t), t).catch(() => {});
  const card = (title: string, sub = "") =>
    page.evaluate(([a, b]) => (window as unknown as TourWindow).__tourCard?.(a, b), [title, sub]).catch(() => {});

  async function point(target: Locator) {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const box = await target.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await sleep(300);
  }
  async function click(target: Locator) {
    await point(target);
    await target.click();
    await sleep(400);
  }
  async function type(target: Locator, text: string) {
    await click(target);
    await target.pressSequentially(text, { delay: 55 });
    await sleep(250);
  }
  async function smoothScroll(dy: number, ms = 1800) {
    // A string, not a function: tsx would wrap a named function in a helper
    // (`__name`) that does not exist inside the page.
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
  const nav = (name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) }).first();

  /** One scene: subtitle on, actions, then hold until its voice-over is done. */
  async function scene(id: string, actions: () => Promise<unknown> = async () => {}) {
    const text = narration.find((n) => n.id === id)!.text;
    const start = Date.now();
    marks.push({ id, at: (start - t0) / 1000 });
    await caption(text);
    await actions();
    const remain = (durations[id] ?? 5) * 1000 + 800 - (Date.now() - start);
    if (remain > 0) await sleep(remain);
    console.log(`scene ${id} ${(Date.now() - start) / 1000}s`);
  }

  // --- tournage -------------------------------------------------------------
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await scene("intro", async () => {
    await card("Bangre", "La scolarité de votre école, simplement");
  });

  await scene("connexion", async () => {
    await card("");
    await type(page.locator('input[name="identifier"]'), "demo@bangre.bf");
    await type(page.locator('input[name="password"]'), "Bangre2026");
    await click(page.getByRole("button", { name: "Se connecter" }));
    await page.waitForURL("**/tableau-de-bord", { timeout: 20000 });
  });
  const later = page.getByRole("button", { name: "Plus tard" });
  if (await later.isVisible().catch(() => false)) await later.click();

  await scene("dashboard", async () => {
    await sleep(800);
    for (const label of ["Total attendu", "Total encaissé", "Reste à recouvrer", "Élèves en retard"]) {
      await point(page.getByText(label, { exact: true }).first());
      await sleep(900);
    }
  });

  await scene("dashboard2", async () => {
    await smoothScroll(420, 2200);
    await sleep(1500);
    await smoothScroll(500, 2200);
  });

  await scene("classes", async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await click(nav("Classes"));
    await page.waitForURL("**/classes");
    await sleep(1500);
  });

  await scene("config", async () => {
    const link = page.locator('a[href$="/configuration"]').first();
    await click(link);
    await page.waitForURL("**/configuration");
    await sleep(1500);
    await smoothScroll(450, 2500);
    await sleep(1200);
    await smoothScroll(450, 2500);
  });

  await scene("eleves", async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await click(nav("Élèves"));
    await page.waitForURL("**/eleves");
    await sleep(800);
    await type(page.getByPlaceholder(/Rechercher par nom/), "OUEDRAOGO");
    await page.keyboard.press("Enter");
    await sleep(1500);
  });

  await scene("ajout", async () => {
    await click(page.getByRole("link", { name: "+ Ajouter un élève" }).first());
    await page.waitForURL("**/eleves/nouveau");
    await sleep(600);
    const classSelect = page.locator('select[name="classId"]');
    await point(classSelect);
    const options = await classSelect.locator("option").evaluateAll((os) =>
      os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? "" }))
    );
    const target = options.find((o) => /CM2/.test(o.t)) ?? options[1];
    await classSelect.selectOption(target.v);
    await sleep(500);
    await type(page.locator('input[name="lastName"]'), "KABORÉ");
    await type(page.locator('input[name="firstName"]'), "Aïcha");
    await type(page.locator('input[placeholder="jj/mm/aaaa"]'), "14/03/2014");
    await type(page.locator('input[name="parentName"]'), "M. Kaboré Issa");
    await type(page.locator('input[name="parentPhone"]'), "70 45 12 98");
    await click(page.getByRole("button", { name: /Ajouter l'élève/ }));
    await page.waitForURL(/\/classes\/.*\/eleves/, { timeout: 20000 });
    await sleep(800);
  });

  await scene("fiche", async () => {
    await click(page.locator("tr", { hasText: "Aïcha" }).first());
    await page.waitForURL(/\/eleves\/[^/]+$/);
    await sleep(1200);
    await point(page.getByText("Détail par tranche").first());
    await sleep(1500);
  });

  await scene("paiement", async () => {
    await click(page.getByRole("button", { name: "Enregistrer un paiement" }).first());
    await sleep(1500);
    const tranche = page.locator('button:has-text("Échéance")').first();
    await click(tranche);
    await sleep(800);
    const method = page.locator("div.fixed select").first();
    if (await method.isVisible().catch(() => false)) await point(method);
    await sleep(600);
    await click(page.getByRole("button", { name: /Valider et générer le reçu/ }));
    await page.getByText(/Reçu N° /).first().waitFor({ timeout: 20000 });
  });

  await scene("recu", async () => {
    await sleep(600);
    const pdf = page.locator("div.fixed a, div.fixed button").filter({ hasText: /reçu|PDF/i }).first();
    if (await pdf.isVisible().catch(() => false)) await point(pdf);
    await sleep(1500);
    const wa = page.getByText("Confirmer par WhatsApp").first();
    if (await wa.isVisible().catch(() => false)) await point(wa);
    await sleep(2000);
    await click(page.getByRole("button", { name: "Fermer" }).first());
  });

  await scene("retards", async () => {
    await click(nav("Retards de paiement"));
    await page.waitForURL("**/retards");
    await sleep(1500);
    await smoothScroll(300, 2000);
    await sleep(800);
    await smoothScroll(-300, 1200);
  });

  await scene("rappel", async () => {
    const boxes = page.locator('tbody input[type="checkbox"]');
    await click(boxes.nth(0));
    await click(boxes.nth(1));
    await click(page.getByRole("button", { name: "Rappel WhatsApp" }).first());
    await page.getByText("Rappels à envoyer").first().waitFor({ timeout: 15000 });
    await sleep(800);
    await click(page.getByRole("button", { name: "Modifier" }).first());
    const text = page.locator("textarea").first();
    if (await text.isVisible().catch(() => false)) await point(text);
    await sleep(2500);
    await click(page.getByRole("button", { name: "Annuler" }).first());
    await click(page.getByRole("button", { name: "Terminé" }).first());
  });

  await scene("paiements", async () => {
    await click(nav("Paiements & reçus"));
    await page.waitForURL("**/paiements");
    await sleep(1500);
    await smoothScroll(350, 2200);
    await sleep(1000);
    await smoothScroll(-350, 1500);
  });

  await scene("horsligne", async () => {
    const ready = page.getByText("Prêt à fonctionner hors ligne").first();
    await ready.waitFor({ timeout: 60000 }).catch(() => {});
    await point(ready);
    await sleep(2500);
  });

  await scene("horsligne2", async () => {
    mode = "refuse";
    for (const s of sockets) s.destroy();
    await context.setOffline(true);
    await sleep(500);
    await click(nav("Élèves"));
    await page.getByText("Hors ligne", { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(800);
    await point(page.getByText("Hors ligne", { exact: true }).nth(1));
    await sleep(2500);
    await click(nav("Tableau de bord"));
    await sleep(1500);
  });

  await scene("outro", async () => {
    await caption("");
    await card("Bangre", "Merci de votre attention !");
    await caption(narration.find((n) => n.id === "outro")!.text);
  });

  fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 1));
  const video = page.video();
  await context.close();
  const file = await video?.path();
  fs.writeFileSync(path.join(OUT, "video-path.txt"), file ?? "");
  console.log("video", file);
  await browser.close();
  proxy.close();
  if (file) mux(file, marks);
}

/** Lays each voice-over clip at the start of its scene and encodes an MP4. */
function mux(video: string, marks: { id: string; at: number }[]) {
  const ffmpeg = process.env.FFMPEG;
  if (!ffmpeg) {
    console.log("FFMPEG non défini : vidéo muette seulement, pas de montage.");
    return;
  }
  const inputs = marks.flatMap((m) => ["-i", path.join(OUT, "audio", `${m.id}.wav`)]);
  const filter =
    marks.map((m, i) => `[${i + 1}:a]adelay=${Math.round((m.at + 0.3) * 1000)}:all=1[a${i}]`).join(";") +
    ";" +
    marks.map((_, i) => `[a${i}]`).join("") +
    `amix=inputs=${marks.length}:normalize=0,volume=1.6,alimiter=limit=0.7:level=false[aout]`;
  const out = path.join(OUT, "Bangre-presentation.mp4");
  execFileSync(
    ffmpeg,
    ["-nostdin", "-loglevel", "error", "-y", "-i", video, ...inputs, "-filter_complex", filter,
      "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "22",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", out],
    { stdio: "inherit" }
  );
  console.log("vidéo finale", out);
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
