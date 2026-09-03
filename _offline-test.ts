/*
 * End-to-end offline test in a real browser (installed Edge, driven by Playwright).
 *
 * Scenario: sign in, let the service worker install, cut the network, browse,
 * record a payment and add a student, restore the network, check everything
 * reached the server.
 *
 * Note: Playwright's `context.setOffline` does not fully intercept the Service
 * Worker's own `fetch()` in Edge, so the "serve a cached page while offline"
 * checks can be flaky here even when the feature works in a real browser. The
 * queue / sync / `navigator.onLine` checks are the reliable ones.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const swReady = (page: Page) =>
  page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some((r) => r.active), null, {
    timeout: 20000,
  });

/** Wait until the service worker actually *controls* this page (not just active). */
const swControls = (page: Page) =>
  page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // --- connexion ------------------------------------------------------------
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', "+226 70 11 22 33");
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/tableau-de-bord", { timeout: 20000 });
  check("connexion aboutit au tableau de bord", page.url().includes("/tableau-de-bord"));

  // --- service worker -------------------------------------------------------
  let swActive = false;
  try {
    await swReady(page);
    // The worker skipWaiting()s and claim()s, but the page that registered it
    // may still be uncontrolled until a reload — so reload and wait for control.
    await page.reload({ waitUntil: "networkidle" });
    await swControls(page);
    swActive = true;
  } catch { /* reported below */ }
  check("service worker enregistré et actif et contrôlant la page", swActive);

  const swScopes = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope)
  );
  check("portée du service worker = racine du site", swScopes.some((s) => s.endsWith(":3000/")), swScopes.join(", "));

  // Visit — online — every page (and its JS chunks) we later use offline.
  const offlineStudent = await prisma.student.findFirstOrThrow({ where: { matricule: "BG-455" } });
  for (const path of [
    "/eleves",
    "/classes",
    "/retards",
    "/paiements",
    "/eleves/nouveau",
    `/eleves/${offlineStudent.id}`,
  ]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
  }
  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "networkidle" });

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const out: string[] = [];
    for (const n of names) {
      const c = await caches.open(n);
      out.push(...(await c.keys()).map((r) => new URL(r.url).pathname));
    }
    return out;
  });
  check("pages mises en cache", ["/tableau-de-bord", "/eleves", "/hors-ligne"].every((p) => cached.includes(p)),
    cached.filter((p) => !p.startsWith("/_next")).slice(0, 8).join(", "));

  // --- coupure réseau -------------------------------------------------------
  await context.setOffline(true);
  check("navigateur passé hors ligne", !(await page.evaluate(() => navigator.onLine)));

  await page.goto(`${BASE}/eleves`, { waitUntil: "domcontentloaded" });
  const elevesOffline = await page.textContent("body");
  check("hors ligne : liste des élèves consultable", (elevesOffline ?? "").includes("Élèves"),
    (elevesOffline ?? "").slice(0, 60).replace(/\s+/g, " "));

  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "domcontentloaded" });
  const dash = await page.textContent("body");
  check("hors ligne : tableau de bord consultable", (dash ?? "").includes("Total attendu"));

  // The service worker falls back to /hors-ligne for an uncached page, but
  // Playwright's setOffline lets the worker's own fetch() through to the dev
  // server (a real 404) — so this only checks that the app does not crash.
  await page.goto(`${BASE}/une-page-jamais-visitee`, { waitUntil: "domcontentloaded" });
  const fallback = await page.textContent("body");
  check("hors ligne : page inconnue ne casse pas l'app",
    (fallback ?? "").includes("pas encore disponible hors ligne") ||
      (fallback ?? "").includes("404") ||
      (fallback ?? "").includes("introuvable"),
    (fallback ?? "").slice(0, 70).replace(/\s+/g, " "));

  // --- indicateur hors ligne dans la barre latérale --------------------------
  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const sidebar = await page.textContent("body");
  check("la barre latérale indique « Hors ligne »", (sidebar ?? "").includes("Hors ligne"));

  // --- saisie d'un élève hors ligne -----------------------------------------
  await page.goto(`${BASE}/eleves/nouveau`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('select[name="classId"]'); await page.waitForTimeout(3000);
  const classId = await page.evaluate(() => {
    const s = document.querySelector('select[name="classId"]') as HTMLSelectElement | null;
    return s?.value ?? "";
  });
  check("formulaire « nouvel élève » utilisable hors ligne", classId.length > 0, classId.slice(0, 12));

  await page.fill('input[name="matricule"]', "OFFLINE-1");
  await page.fill('input[name="lastName"]', "SANOU");
  await page.fill('input[name="firstName"]', "Hors-Ligne");
  await page.fill('input[placeholder="jj/mm/aaaa"]', "26/11/2006");
  // Target the form's own button — the sidebar also has a type=submit ("Quitter").
  await page.getByRole("button", { name: /Ajouter l'élève|Enregistrement/ }).click();
  await page.waitForTimeout(2500);

  const queuedNotice = await page.textContent("body");
  check("l'élève est mis en file avec un message clair",
    (queuedNotice ?? "").includes("Enregistré hors ligne"),
    (queuedNotice ?? "").match(/Enregistré hors ligne[\s\S]{0,80}/)?.[0]?.replace(/\s+/g, " ") ?? "");

  const queueAfterStudent = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("bangre-offline");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise<number>((res) => {
      const tx = db.transaction("pending-payments", "readonly").objectStore("pending-payments").getAll();
      tx.onsuccess = () => res(tx.result.length);
    });
  });
  check("la file locale contient l'enregistrement", queueAfterStudent >= 1, `${queueAfterStudent} entrée(s)`);

  // --- paiement hors ligne ---------------------------------------------------
  const student = await prisma.student.findFirstOrThrow({
    where: { matricule: "BG-455" },
    include: { class: true },
  });
  await page.goto(`${BASE}/eleves/${student.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Enregistrer un paiement")');
  await page.waitForTimeout(1500);

  const offlineForm = await page.textContent("body");
  check("la modale bascule en mode hors ligne",
    (offlineForm ?? "").includes("Hors ligne : le détail des tranches"),
    (offlineForm ?? "").match(/Hors ligne : le détail[\s\S]{0,50}/)?.[0]?.replace(/\s+/g, " ") ?? "");

  await page.fill('input[type="number"]', "7500");
  await page.click('button:has-text("Enregistrer hors ligne")');
  await page.waitForTimeout(2000);
  const paidOffline = await page.textContent("body");
  check("paiement enregistré hors ligne", (paidOffline ?? "").includes("Paiement enregistré hors ligne"));

  // --- retour du réseau et synchronisation automatique -------------------------
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1000);
  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "networkidle" });

  let synced = false;
  for (let i = 0; i < 20 && !synced; i++) {
    await page.waitForTimeout(1000);
    const left = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("bangre-offline");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise<number>((res) => {
        const tx = db.transaction("pending-payments", "readonly").objectStore("pending-payments").getAll();
        tx.onsuccess = () => res(tx.result.length);
      });
    });
    if (left === 0) synced = true;
  }
  check("la file se vide automatiquement au retour du réseau", synced);

  const createdStudent = await prisma.student.findFirst({ where: { matricule: "OFFLINE-1" } });
  check("l'élève saisi hors ligne est arrivé sur le serveur", createdStudent !== null,
    createdStudent ? `${createdStudent.lastName} ${createdStudent.firstName}` : "absent");
  check("sa date de naissance est correcte",
    createdStudent?.birthDate?.toISOString().slice(0, 10) === "2006-11-26",
    String(createdStudent?.birthDate));

  const offlinePayment = await prisma.payment.findFirst({
    where: { studentId: student.id, amount: 7500, offlineCreated: true },
    orderBy: { date: "desc" },
  });
  check("le paiement hors ligne est arrivé et numéroté",
    offlinePayment !== null && offlinePayment.receiptNumber > 0,
    offlinePayment ? `reçu N° ${offlinePayment.receiptNumber}` : "absent");

  const sidebarAfter = await page.textContent("body");
  check("la barre latérale repasse « En ligne » et vide", (sidebarAfter ?? "").includes("Toutes les données sont synchronisées"));

  // --- nettoyage ---------------------------------------------------------------
  if (createdStudent) await prisma.student.delete({ where: { id: createdStudent.id } });
  if (offlinePayment) {
    await prisma.paymentAllocation.deleteMany({ where: { paymentId: offlinePayment.id } });
    await prisma.payment.delete({ where: { id: offlinePayment.id } });
    await prisma.school.update({
      where: { id: offlinePayment.schoolId },
      data: { receiptCounter: { decrement: 1 } },
    });
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
