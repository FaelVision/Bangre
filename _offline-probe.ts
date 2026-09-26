/*
 * Probe: how does Bangré behave on the kinds of bad network a school really has?
 * A TCP proxy sits between the browser and the server, and can
 *   - pass    : normal
 *   - refuse  : close every connection at once (network down, onLine still true)
 *   - hang    : accept and never answer (wifi with no internet behind it)
 * Records page errors, the global error screen, and how long each click takes.
 */
import net from "node:net";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { chromium, type Page } from "playwright";

const SERVER_PORT = 3101;
const PROXY_PORT = 3100;
const BASE = `http://127.0.0.1:${PROXY_PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mode: "pass" | "refuse" | "hang" = "pass";
const sockets = new Set<net.Socket>();
const proxy = net.createServer((client) => {
  sockets.add(client);
  client.on("close", () => sockets.delete(client));
  client.on("error", () => {});
  if (mode === "refuse") return void client.destroy();
  if (mode === "hang") return; // never answers
  const upstream = net.connect(SERVER_PORT, "127.0.0.1");
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});
function setMode(m: typeof mode) {
  mode = m;
  if (m !== "pass") for (const s of sockets) s.destroy();
}

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

const events: string[] = [];
function log(s: string) {
  console.log(s);
  events.push(s);
}

async function screenText(page: Page) {
  return ((await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) || "").replace(/\s+/g, " ");
}

/** Clicks and waits until `expected` shows, reporting the time and any error screen. */
async function step(page: Page, label: string, action: () => Promise<unknown>, expected: string, timeout = 30000, path?: string) {
  const t0 = Date.now();
  await action().catch((e) => log(`   action error: ${String(e).slice(0, 120)}`));
  let text = "";
  while (Date.now() - t0 < timeout) {
    text = await screenText(page);
    const atPath = !path || new URL(page.url()).pathname === path;
    if ((atPath && text.includes(expected)) || text.includes("Une erreur est survenue") || text.includes("Pas de connexion")) break;
    await sleep(200);
  }
  const ms = Date.now() - t0;
  const bad = text.includes("Une erreur est survenue")
    ? "ÉCRAN D'ERREUR"
    : text.includes("Pas de connexion")
      ? "PAGE PAS DE CONNEXION"
      : text.includes(expected)
        ? "ok"
        : "PAS AFFICHÉ";
  log(`[${mode}] ${label}: ${bad} en ${ms} ms  (${page.url().replace(BASE, "")})`);
}

async function scenario(page: Page, name: string) {
  log(`\n=== ${name} ===`);
  const click = (name: string) => () => page.getByRole("link", { name: new RegExp(`^${name}`) }).first().click();
  await step(page, "clic Classes", click("Classes"), "Classes", 30000, "/classes");
  await step(page, "clic Élèves", click("Élèves"), "élèves actifs", 30000, "/eleves");
  await step(page, "clic Retards", click("Retards de paiement"), "Retards de paiement", 30000, "/retards");
  await step(page, "clic Paiements", click("Paiements & reçus"), "Paiements", 30000, "/paiements");
  await step(page, "clic Tableau de bord", click("Tableau de bord"), "Total attendu", 30000, "/tableau-de-bord");
  await step(page, "clic Quitter (doit refuser)", () => page.getByRole("button", { name: "Quitter" }).click(), "la déconnexion se fait en ligne");
  await step(page, "rechargement", () => page.reload({ waitUntil: "commit", timeout: 60000 }), "Total attendu", 40000);
  await step(page, "ouvrir fiche élève (lien liste)", async () => {
    await page.getByRole("link", { name: /^Élèves/ }).first().click();
    await page.waitForSelector("tbody tr", { timeout: 20000 });
    await page.locator("tbody tr").first().click();
  }, "Détail par tranche");
  await step(page, "modale paiement", () => page.click('button:has-text("Enregistrer un paiement")'), "Paiement partiel");
  await step(page, "valider paiement", async () => {
    await page.click('button:has-text("Paiement partiel")');
    await page.fill('input[type="number"]', "500");
    await page.click('button:has-text("Valider et générer le reçu")');
  }, "Paiement enregistré hors ligne");
  await page.click('button:has-text("Fermer")').catch(() => {});
  await step(page, "nouvel élève", () => page.goto(`${BASE}/eleves/nouveau`, { waitUntil: "commit", timeout: 60000 }), "Ajouter l'élève");
  await step(page, "saisie élève", async () => {
    await page.fill('input[name="lastName"]', "PROBE");
    await page.fill('input[name="firstName"]', name.slice(0, 10));
    await page.getByRole("button", { name: /Ajouter l'élève/ }).click();
  }, "Enregistré hors ligne");
}

async function main() {
  await startServer();
  proxy.listen(PROXY_PORT);
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`   PAGEERROR: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`   console.error: ${m.text().slice(0, 200)}`);
  });

  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="identifier"]', "+226 70 11 22 33");
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/tableau-de-bord", { timeout: 20000 });
  for (let i = 0; i < 90; i++) {
    if ((await screenText(page)).includes("Prêt à fonctionner hors ligne")) break;
    await sleep(1000);
  }
  log(`prêt: ${(await screenText(page)).includes("Prêt à fonctionner hors ligne")}`);
  const later = page.getByRole("button", { name: "Plus tard" });
  if (await later.isVisible().catch(() => false)) await later.click();

  const which = process.argv[2] ?? "refuse,hang,offline";
  for (const s of which.split(",")) {
    setMode("pass");
    await context.setOffline(false);
    await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "networkidle" }).catch(() => {});
    if (await later.isVisible().catch(() => false)) await later.click();
    if (s === "offline") {
      setMode("refuse");
      await context.setOffline(true);
    } else setMode(s as typeof mode);
    await scenario(page, s);
  }

  // Network comes back (hang -> pass) without any browser "online" event:
  // the probe must notice it on its own, and the outbox must empty.
  log("=== retour du réseau ===");
  await context.setOffline(false);
  setMode("hang");
  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "commit" }).catch(() => {});
  await sleep(3000);
  setMode("pass");
  const t0 = Date.now();
  let back = false;
  while (Date.now() - t0 < 60000 && !back) {
    await sleep(500);
    back = (await screenText(page)).includes("Connexion revenue");
  }
  log(`bandeau « Connexion revenue » : ${back} en ${Date.now() - t0} ms`);
  let empty = false;
  while (Date.now() - t0 < 90000 && !empty) {
    await sleep(1000);
    empty = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open("bangre-offline");
        r.onsuccess = () => res(r.result);
      });
      return new Promise<boolean>((res) => {
        const tx = db.transaction("pending-payments").objectStore("pending-payments").getAll();
        tx.onsuccess = () => res(tx.result.filter((e: { rejectedAt?: number }) => !e.rejectedAt).length === 0);
      });
    });
  }
  log(`file d'attente vidée : ${empty} en ${Date.now() - t0} ms`);
  await page.getByRole("button", { name: "Revenir à la version en ligne" }).click().catch(() => {});
  await sleep(3000);
  log(`version en ligne rechargée : ${!(await screenText(page)).includes("Connexion revenue") && (await screenText(page)).includes("Total attendu")}`);

  await browser.close();
  proxy.close();
}

main()
  .catch((e) => console.error(e))
  .finally(() => {
    if (server?.pid) execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    process.exit(0);
  });
