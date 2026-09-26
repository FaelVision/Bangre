import test from "node:test";
import assert from "node:assert/strict";

import { applyPendingOperations, reviveSnapshot, type MirrorData } from "../src/lib/offline-data";
import {
  dashboardData,
  lateStudents,
  paymentsOverview,
  searchStudents,
  sidebarCounts,
  studentDetail,
  studentsList,
} from "../src/lib/offline-queries";
import type { QueuedEntry } from "../src/lib/offline-queue";

/**
 * The device copy: what the app reads from when there is no network. These
 * tests build a small school as JSON (exactly what `/api/offline/snapshot`
 * returns), then check the screens read the same figures the server would.
 */

const NOW = new Date("2026-03-15T10:00:00.000Z");

function snapshotJson() {
  return {
    ok: true,
    syncedAt: "2026-03-15T09:00:00.000Z",
    school: {
      id: "school-1",
      name: "Lycée municipal",
      contactName: "Awa OUEDRAOGO",
      city: "Ouagadougou",
      type: "Lycée",
      receiptCounter: 12,
      subscriptionStatus: "active",
      subscriptionRenewsAt: "2026-12-31T00:00:00.000Z",
      trialEndsAt: null,
      blocked: false,
    },
    academicYear: { id: "year-1", label: "2025-2026" },
    classes: [
      {
        id: "class-1",
        schoolId: "school-1",
        academicYearId: "year-1",
        name: "6e A",
        level: "Collège",
        order: 1,
        tuitionAmount: 100000,
        registrationFee: null,
        reminderEnabled: true,
        reminderBeforeDays: 7,
        reminderAfterDays: "3,10",
        reminderHour: "08:00",
        reminderMessageTemplate: null,
        archived: false,
        createdAt: "2025-09-01T00:00:00.000Z",
        tranches: [
          {
            id: "tranche-1",
            classId: "class-1",
            label: "1re tranche",
            amount: 60000,
            kind: "tuition",
            dueType: "date",
            dueDate: "2026-01-10T00:00:00.000Z",
            order: 1,
          },
          {
            id: "tranche-2",
            classId: "class-1",
            label: "2e tranche",
            amount: 40000,
            kind: "tuition",
            dueType: "date",
            dueDate: "2026-06-10T00:00:00.000Z",
            order: 2,
          },
        ],
      },
      {
        id: "class-2",
        schoolId: "school-1",
        academicYearId: "year-1",
        name: "5e B",
        level: "Collège",
        order: 2,
        tuitionAmount: null,
        registrationFee: null,
        reminderEnabled: true,
        reminderBeforeDays: 7,
        reminderAfterDays: "3,10",
        reminderHour: "08:00",
        reminderMessageTemplate: null,
        archived: false,
        createdAt: "2025-09-01T00:00:00.000Z",
        tranches: [],
      },
    ],
    students: [
      student("student-1", "class-1", "BG-451", "SAWADOGO", "Aminata", "+22670112233"),
      student("student-2", "class-1", "BG-452", "KABORE", "Issa", "+22670112244"),
      student("student-3", "class-2", "BG-453", "TRAORE", "Fatou", null),
    ],
    payments: [
      {
        id: "payment-1",
        schoolId: "school-1",
        studentId: "student-1",
        amount: 60000,
        method: "cash",
        receivedBy: "Awa",
        date: "2026-03-15T08:00:00.000Z",
        receiptNumber: 12,
        note: null,
        offlineCreated: false,
        synced: true,
        whatsappNotified: false,
        allocations: [{ id: "alloc-1", paymentId: "payment-1", trancheId: "tranche-1", amount: 60000 }],
      },
    ],
    reminders: [
      {
        id: "reminder-1",
        schoolId: "school-1",
        studentId: "student-2",
        trancheId: "tranche-1",
        channel: "whatsapp",
        trigger: "manual",
        status: "sent",
        providerMessageId: null,
        message: "Bonjour…",
        sentAt: "2026-03-01T08:00:00.000Z",
      },
    ],
  };
}

function student(
  id: string,
  classId: string,
  matricule: string,
  lastName: string,
  firstName: string,
  parentPhone: string | null
) {
  return {
    id,
    schoolId: "school-1",
    classId,
    matricule,
    lastName,
    firstName,
    birthDate: "2012-05-04T00:00:00.000Z",
    gender: "F",
    parentName: "Parent",
    parentPhone,
    whatsappStatus: parentPhone ? "reachable" : "unknown",
    status: "active",
    tuitionOverride: null,
    createdAt: "2025-09-01T00:00:00.000Z",
  };
}

/** JSON round-trip, exactly as the snapshot travels from the server to IndexedDB. */
function mirror(): MirrorData {
  return reviveSnapshot(JSON.parse(JSON.stringify(snapshotJson())));
}

function queued(entry: Partial<QueuedEntry> & Pick<QueuedEntry, "kind">): QueuedEntry {
  return {
    id: "q1",
    createdAt: NOW.getTime(),
    label: "test",
    attempts: 0,
    ...entry,
  } as QueuedEntry;
}

test("reviveSnapshot turns the JSON back into real dates", () => {
  const data = mirror();
  assert.ok(data.syncedAt instanceof Date);
  assert.ok(data.classes[0].tranches[0].dueDate instanceof Date);
  assert.ok(data.students[0].birthDate instanceof Date);
  assert.ok(data.payments[0].date instanceof Date);
  assert.ok(data.reminders[0].sentAt instanceof Date);
  assert.equal(data.school.subscriptionRenewsAt?.getUTCFullYear(), 2026);
  assert.equal(data.students[2].parentPhone, null);
});

test("le tableau de bord compte comme le serveur", () => {
  const data = dashboardData(mirror(), NOW);

  // Only the class with a tuition amount is billed: 2 students x 100 000.
  assert.equal(data.totalExpected, 200000);
  assert.equal(data.totalCollected, 60000);
  assert.equal(data.totalRemaining, 140000);
  assert.equal(data.recoveryPercent, 30);
  assert.equal(data.billedStudentCount, 2);
  assert.equal(data.unbilledStudentCount, 1, "la classe sans scolarité reste hors des totaux");
  assert.equal(data.partielCount, 1);
  assert.equal(data.rienPayeCount, 1);
  assert.equal(data.lateCount, 1, "la 1re tranche est échue et impayée pour KABORE");
  assert.equal(data.recentPayments[0].id, "payment-1");
  assert.equal(data.recentPayments[0].student.class.name, "6e A");
});

test("la liste des élèves filtre et pagine", () => {
  const all = studentsList(mirror(), {}, NOW);
  assert.equal(all.total, 3);
  assert.deepEqual(
    all.rows.map((r) => r.student.matricule),
    ["BG-452", "BG-451", "BG-453"],
    "triés par nom puis prénom"
  );

  assert.equal(studentsList(mirror(), { classId: "class-1" }, NOW).total, 2);
  assert.equal(studentsList(mirror(), { q: "amina" }, NOW).total, 1);
  assert.equal(studentsList(mirror(), { q: "BG-453" }, NOW).total, 1);
  assert.equal(studentsList(mirror(), { statut: "retard" }, NOW).total, 1);
  assert.equal(studentsList(mirror(), { statut: "non_defini" }, NOW).total, 1);
});

test("les retards reprennent le dernier rappel envoyé", () => {
  const late = lateStudents(mirror(), {}, NOW);
  assert.equal(late.rows.length, 1);
  assert.equal(late.rows[0].student.id, "student-2");
  assert.equal(late.totalDue, 60000);
  assert.equal(late.reachableCount, 1);
  assert.equal(late.rows[0].lastReminder?.id, "reminder-1");

  assert.equal(lateStudents(mirror(), { minDays: 200 }, NOW).rows.length, 0);
  assert.equal(lateStudents(mirror(), { whatsapp: "injoignable" }, NOW).rows.length, 0);
});

test("le journal des paiements totalise le jour et la semaine", () => {
  const view = paymentsOverview(mirror(), 1, NOW);
  assert.equal(view.total, 1);
  assert.equal(view.totalAmount, 60000);
  assert.equal(view.todayAmount, 60000);
  assert.equal(view.offlineCount, 0);
  assert.equal(view.payments[0].allocations[0].tranche.label, "1re tranche");
  assert.equal(view.payments[0].student.class.name, "6e A");
});

test("un paiement en attente apparaît partout, réparti sur les tranches dues", () => {
  const entry = queued({
    kind: "payment",
    payload: {
      studentId: "student-2",
      mode: "partial",
      trancheIds: [],
      amount: 70000,
      method: "cash",
      date: "2026-03-15T09:30:00.000Z",
      receivedBy: "Awa",
      notifyWhatsapp: false,
    },
  });

  const data = applyPendingOperations(mirror(), [entry], NOW);
  const detail = studentDetail(data, "student-2", NOW);

  assert.ok(detail);
  assert.equal(detail.summary.paid, 70000, "60 000 sur la 1re tranche, 10 000 sur la 2e");
  assert.equal(detail.summary.status, "partiel", "plus aucune tranche échue impayée");
  assert.equal(detail.student.payments[0].receiptNumber, 0, "le numéro de reçu vient du serveur");
  assert.deepEqual(
    detail.student.payments[0].allocations.map((a) => [a.tranche.label, a.amount]),
    [
      ["1re tranche", 60000],
      ["2e tranche", 10000],
    ]
  );

  const journal = paymentsOverview(data, 1, NOW);
  assert.equal(journal.total, 2);
  assert.equal(journal.offlineCount, 1, "signalé comme à synchroniser");
  assert.equal(dashboardData(data, NOW).totalCollected, 130000);
  assert.equal(lateStudents(data, {}, NOW).rows.length, 0);
});

test("un élève ajouté hors ligne reçoit le prochain matricule et compte dans sa classe", () => {
  const entry = queued({
    kind: "student.create",
    payload: {
      classId: "class-1",
      lastName: "  compaore ",
      firstName: " Salif ",
      parentPhone: "70 99 88 77",
      gender: "M",
    },
  });

  const data = applyPendingOperations(mirror(), [entry], NOW);
  const created = data.students.find((s) => s.lastName === "COMPAORE");

  assert.ok(created);
  assert.equal(created.matricule, "BG-454", "suit les matricules déjà connus de cet appareil");
  assert.equal(created.firstName, "Salif");
  assert.equal(created.parentPhone, "+22670998877", "normalisé comme le ferait le serveur");
  assert.equal(created.whatsappStatus, "reachable");

  assert.equal(sidebarCounts(data, NOW).studentsCount, 4);
  assert.equal(studentsList(data, { classId: "class-1" }, NOW).total, 3);
  assert.equal(searchStudents(data, "compaore")[0]?.id, created.id);
});

test("une fiche modifiée hors ligne remplace la version locale", () => {
  const entry = queued({
    kind: "student.update",
    studentId: "student-1",
    payload: {
      classId: "class-1",
      matricule: "BG-451",
      lastName: "sawadogo",
      firstName: "Aminata",
      parentName: "M. SAWADOGO",
      parentPhone: "+226 70 00 00 09",
      whatsappStatus: "invalid",
    },
  });

  const data = applyPendingOperations(mirror(), [entry], NOW);
  const updated = data.students.find((s) => s.id === "student-1");

  assert.equal(updated?.parentName, "M. SAWADOGO");
  assert.equal(updated?.parentPhone, "+22670000009");
  assert.equal(updated?.whatsappStatus, "invalid");
});

test("un rappel envoyé hors ligne est visible sur la fiche avant même la synchronisation", () => {
  const entry = queued({
    kind: "reminder.send",
    studentId: "student-2",
    trancheId: "tranche-1",
    message: "Bonjour, la 1re tranche…",
  });

  const data = applyPendingOperations(mirror(), [entry], NOW);
  const detail = studentDetail(data, "student-2", NOW);

  assert.equal(detail?.student.reminders.length, 2);
  assert.equal(detail?.student.reminders[0].message, "Bonjour, la 1re tranche…");
  assert.equal(lateStudents(data, {}, NOW).rows[0].lastReminder?.trancheId, "tranche-1");
});

test("les opérations en attente sont rejouées dans l'ordre de saisie", () => {
  const create = queued({
    id: "q1",
    createdAt: NOW.getTime(),
    kind: "student.create",
    payload: { classId: "class-1", lastName: "DIALLO", firstName: "Aissata" },
  });
  const second = queued({
    id: "q2",
    createdAt: NOW.getTime() + 1000,
    kind: "student.create",
    payload: { classId: "class-1", lastName: "OUEDRAOGO", firstName: "Karim" },
  });

  // Given out of order: the outbox is still replayed oldest-first, so the
  // second student gets the matricule after the first.
  const data = applyPendingOperations(mirror(), [second, create], NOW);
  assert.equal(data.students.find((s) => s.lastName === "DIALLO")?.matricule, "BG-454");
  assert.equal(data.students.find((s) => s.lastName === "OUEDRAOGO")?.matricule, "BG-455");
});

test("une saisie refusée par le serveur ou faite pour une autre école n'apparaît pas dans la copie locale", () => {
  const payment = (id: string, extra: { schoolId?: string; rejectedAt?: number; lastError?: string }) =>
    queued({
      id,
      kind: "payment",
      payload: {
        studentId: "student-2",
        mode: "partial",
        trancheIds: [],
        amount: 10000,
        method: "cash",
        date: "2026-03-15",
        receivedBy: "Awa",
        notifyWhatsapp: false,
      },
      ...extra,
    });

  const data = applyPendingOperations(
    mirror(),
    [
      payment("mine", { schoolId: "school-1" }),
      payment("refused", { schoolId: "school-1", rejectedAt: NOW.getTime(), lastError: "Classe introuvable." }),
      payment("other-school", { schoolId: "school-2" }),
    ],
    NOW
  );
  const detail = studentDetail(data, "student-2", NOW);
  assert.ok(detail);
  assert.equal(detail.summary.paid, 10000, "seul le paiement en attente de cette école compte");
});

test("un paiement saisi pour un élève créé hors ligne s'applique à cet élève", () => {
  const create = queued({
    id: "new-student",
    kind: "student.create",
    payload: { classId: "class-1", lastName: "zongo", firstName: "Paul", parentPhone: "70 00 00 01" },
  });
  const pay = queued({
    id: "pay-new",
    createdAt: NOW.getTime() + 1000,
    kind: "payment",
    payload: {
      studentId: "local:new-student",
      mode: "partial",
      trancheIds: [],
      amount: 25000,
      method: "cash",
      date: "2026-03-15",
      receivedBy: "Awa",
      notifyWhatsapp: false,
    },
  });
  const data = applyPendingOperations(mirror(), [pay, create], NOW);
  const detail = studentDetail(data, "local:new-student", NOW);
  assert.ok(detail);
  assert.equal(detail.student.lastName, "ZONGO");
  assert.equal(detail.summary.paid, 25000);
});
