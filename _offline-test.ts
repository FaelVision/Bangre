/*
 * End-to-end offline test in a real browser (installed Edge, driven by Playwright).
 *
 * Scenario: start the production server, sign in, let the service worker install
 * and the device copy download, then *stop the server* — the only way to be
 * genuinely offline, since a browser "offline" toggle does not always apply to
 * the service worker's own fetches. With no server at all, browse pages this
 * device has never visited, record a payment and add a student, bring the
 * server back, and check everything reached the database.
 *
 * Run: npm run build && npx tsx _offline-test.ts
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const prisma = new PrismaClient();
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The renewal popup sits above everything; get it out of the way before clicking. */
async function dismissAlerts(page: Page) {
  const later = page.getByRole("button", { name: "Plus tard" });
  if (await later.isVisible().catch(() => false)) await later.click();
}

// --- server lifecycle -------------------------------------------------------

let server: ChildProcess | null = null;

async function startServer() {
  server = spawn("npm.cmd", ["run", "start", "--", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT) },
  });

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/connexion`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error("le serveur ne démarre pas");
}

async function stopServer() {
  if (!server?.pid) return;
  // The npm wrapper spawns next itself: kill the whole tree, or the port stays open.
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
  } catch {
    server.kill("SIGKILL");
  }
  server = null;

  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${BASE}/connexion`);
    } catch {
      return; // connection refused: really offline
    }
    await sleep(500);
  }
  throw new Error("le serveur répond encore");
}

// --- browser helpers --------------------------------------------------------

const swControls = (page: Page) =>
  page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });

/** How many entries the outbox holds, read straight from IndexedDB. */
const queueLength = (page: Page) =>
  page.evaluate(async () => {
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

/** The downloaded copy of the school: how many students it holds, if any. */
const mirrorStudents = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("bangre-offline");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains("mirror")) return -1;
    return new Promise<number>((res) => {
      const tx = db.transaction("mirror", "readonly").objectStore("mirror").get("current");
      tx.onsuccess = () => res(tx.result?.snapshot?.students?.length ?? 0);
      tx.onerror = () => res(-1);
    });
  });

async function main() {
  await startServer();

  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "msedge" });
  } catch {
    browser = await chromium.launch();
  }
  const context: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // --- connexion ------------------------------------------------------------
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.fill('input[name="identifier"]', "+226 70 11 22 33");
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/tableau-de-bord", { timeout: 20000 });
  check("connexion aboutit au tableau de bord", page.url().includes("/tableau-de-bord"));
  await dismissAlerts(page);

  // --- service worker + copie locale ----------------------------------------
  let swActive = false;
  try {
    await page.reload({ waitUntil: "networkidle" });
    await swControls(page);
    swActive = true;
  } catch {
    /* reported below */
  }
  check("service worker actif et contrôlant la page", swActive);
  await dismissAlerts(page);

  let students = 0;
  for (let i = 0; i < 20 && students <= 0; i++) {
    await sleep(500);
    students = await mirrorStudents(page);
  }
  check("les données de l'école sont copiées sur l'appareil", students > 0, `${students} élèves`);

  const shellCached = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      if (await cache.match("/hors-ligne")) return true;
    }
    return false;
  });
  check("l'application hors ligne est en cache", shellCached);

  // A student whose page this browser has never opened: everything below must
  // work from the local copy, not from a page cached on the way in.
  const student = await prisma.student.findFirstOrThrow({
    where: { matricule: "BG-455" },
    include: { class: true },
  });

  // --- coupure totale : le serveur est arrêté --------------------------------
  await stopServer();
  await context.setOffline(true);
  check("navigateur hors ligne, serveur arrêté", !(await page.evaluate(() => navigator.onLine)));

  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const dash = await page.textContent("body");
  check("hors ligne : tableau de bord rendu depuis l'appareil", (dash ?? "").includes("Total attendu"));

  await page.goto(`${BASE}/eleves/${student.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const detail = await page.textContent("body");
  check(
    "hors ligne : fiche élève jamais consultée, rendue depuis l'appareil",
    (detail ?? "").includes(student.lastName) && (detail ?? "").includes("Détail par tranche"),
    student.matricule
  );

  await page.goto(`${BASE}/retards`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const late = await page.textContent("body");
  check("hors ligne : retards de paiement consultables", (late ?? "").includes("Retards de paiement"));

  await page.goto(`${BASE}/classes/${student.classId}/eleves`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const classList = await page.textContent("body");
  check("hors ligne : liste des élèves de la classe consultable", (classList ?? "").includes(student.class.name));

  // --- paiement hors ligne, avec le détail des tranches ----------------------
  await page.goto(`${BASE}/eleves/${student.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Enregistrer un paiement")');
  await page.waitForTimeout(1500);

  const modal = await page.textContent("body");
  check(
    "la modale garde le détail des tranches hors ligne",
    (modal ?? "").includes("Tranche(s) payée(s)") && (modal ?? "").includes("données de cet appareil")
  );

  await page.click('button:has-text("Paiement partiel")');
  await page.fill('input[type="number"]', "7500");
  await page.click('button:has-text("Valider et générer le reçu")');
  await page.waitForTimeout(2000);
  const paid = await page.textContent("body");
  check("paiement enregistré hors ligne", (paid ?? "").includes("Paiement enregistré hors ligne"));

  await page.click('button:has-text("Fermer")').catch(() => {});
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/paiements`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const journal = await page.textContent("body");
  check("le paiement apparaît aussitôt dans le journal local", (journal ?? "").includes("Hors ligne"));

  // --- saisie d'un élève hors ligne -----------------------------------------
  await page.goto(`${BASE}/eleves/nouveau`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('select[name="classId"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const classId = await page.evaluate(() => {
    const s = document.querySelector('select[name="classId"]') as HTMLSelectElement | null;
    return s?.value ?? "";
  });
  check("formulaire « nouvel élève » utilisable hors ligne", classId.length > 0, classId.slice(0, 12));

  // Put the student in a class whose tuition is configured, so they can pay.
  await page.selectOption('select[name="classId"]', student.classId);
  await page.fill('input[name="matricule"]', "OFFLINE-1");
  await page.fill('input[name="lastName"]', "SANOU");
  await page.fill('input[name="firstName"]', "Hors-Ligne");
  await page.fill('input[placeholder="jj/mm/aaaa"]', "26/11/2006");
  await page.fill('input[name="parentPhone"]', "70 99 88 77");
  await page.getByRole("button", { name: /Ajouter l'élève|Enregistrement/ }).click();
  await page.waitForTimeout(2500);
  const queuedNotice = await page.textContent("body");
  check("l'élève est mis en file avec un message clair", (queuedNotice ?? "").includes("Enregistré hors ligne"));

  const queued = await queueLength(page);
  check("la file locale contient les deux saisies", queued >= 2, `${queued} entrée(s)`);

  await page.goto(`${BASE}/eleves?q=SANOU`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const listWithQueued = await page.textContent("body");
  check("l'élève saisi hors ligne apparaît dans la liste locale", (listWithQueued ?? "").includes("Hors-Ligne"));

  // --- encaisser l'élève qui n'existe encore que sur l'appareil ---------------
  // Until now this payment pointed at the device's temporary id and the server
  // refused it at sync: the money was recorded nowhere.
  await page.click('tr:has-text("Hors-Ligne")');
  await page.waitForTimeout(1500);
  check("la fiche de l'élève saisi hors ligne s'ouvre", page.url().includes("/eleves/local"), page.url());

  await page.click('button:has-text("Enregistrer un paiement")');
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Paiement partiel")');
  await page.fill('input[type="number"]', "3000");
  await page.click('button:has-text("Valider et générer le reçu")');
  await page.waitForTimeout(2000);
  const paidNew = await page.textContent("body");
  check("paiement de l'élève saisi hors ligne enregistré", (paidNew ?? "").includes("Paiement enregistré hors ligne"));
  check(
    "confirmation WhatsApp au parent proposée hors ligne",
    (await page.locator('a:has-text("Confirmer par WhatsApp")').count()) > 0
  );
  await page.click('button:has-text("Fermer")').catch(() => {});
  await page.waitForTimeout(800);

  // --- rappel hors ligne : plusieurs tranches en retard -----------------------
  await page.goto(`${BASE}/eleves/${student.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("Envoyer un rappel")').first().click();
  await page.waitForTimeout(1500);
  const reminderText = await page.locator("textarea").first().inputValue().catch(() => "");
  check("rappel préparé hors ligne", reminderText.includes(student.firstName), reminderText.slice(0, 60));
  await page.click('button:has-text("Annuler")').catch(() => {});

  // --- retour du réseau ------------------------------------------------------
  await startServer();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: "networkidle" });

  let synced = false;
  for (let i = 0; i < 25 && !synced; i++) {
    await sleep(1000);
    synced = (await queueLength(page)) === 0;
  }
  check("la file se vide automatiquement au retour du réseau", synced);

  const createdStudent = await prisma.student.findFirst({ where: { matricule: "OFFLINE-1" } });
  check(
    "l'élève saisi hors ligne est arrivé sur le serveur",
    createdStudent !== null,
    createdStudent ? `${createdStudent.lastName} ${createdStudent.firstName}` : "absent"
  );
  check(
    "sa date de naissance est correcte",
    createdStudent?.birthDate?.toISOString().slice(0, 10) === "2006-11-26",
    String(createdStudent?.birthDate)
  );

  const newStudentPayment = createdStudent
    ? await prisma.payment.findFirst({ where: { studentId: createdStudent.id, amount: 3000 } })
    : null;
  check(
    "le paiement de l'élève saisi hors ligne est arrivé, sur le bon élève",
    newStudentPayment !== null && newStudentPayment.receiptNumber > 0,
    newStudentPayment ? `reçu N° ${newStudentPayment.receiptNumber}` : "absent"
  );

  const offlinePayment = await prisma.payment.findFirst({
    where: { studentId: student.id, amount: 7500, offlineCreated: true },
    orderBy: { date: "desc" },
  });
  check(
    "le paiement hors ligne est arrivé et numéroté",
    offlinePayment !== null && offlinePayment.receiptNumber > 0,
    offlinePayment ? `reçu N° ${offlinePayment.receiptNumber}` : "absent"
  );

  // The copy on the device is pulled again after the replay, so the payment it
  // shows is now the server's own row — numbered, and no longer "hors ligne".
  let refreshed = false;
  for (let i = 0; i < 15 && !refreshed; i++) {
    await sleep(1000);
    refreshed = await page.evaluate(async (matricule) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("bangre-offline");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise<boolean>((res) => {
        const tx = db.transaction("mirror", "readonly").objectStore("mirror").get("current");
        tx.onsuccess = () =>
          res(
            Boolean(
              tx.result?.snapshot?.students?.some((s: { matricule: string }) => s.matricule === matricule)
            )
          );
        tx.onerror = () => res(false);
      });
    }, "OFFLINE-1");
  }
  check("la copie locale est re-téléchargée après la synchronisation", refreshed);

  const sidebarAfter = await page.textContent("body");
  check(
    "la barre latérale repasse « En ligne » et vide",
    (sidebarAfter ?? "").includes("Toutes les données sont synchronisées")
  );

  // --- nettoyage ---------------------------------------------------------------
  if (newStudentPayment) {
    await prisma.paymentAllocation.deleteMany({ where: { paymentId: newStudentPayment.id } });
    await prisma.payment.delete({ where: { id: newStudentPayment.id } });
    await prisma.school.update({
      where: { id: newStudentPayment.schoolId },
      data: { receiptCounter: { decrement: 1 } },
    });
  }
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

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer().catch(() => {});
    await prisma.$disconnect();
  });
