import test from "node:test";
import assert from "node:assert/strict";
import {
  computeReminderActions,
  calendarDaysUntil,
  parseAfterDays,
  type ClassReminderConfig,
  type SentIndex,
  type StudentSnapshot,
} from "../src/lib/reminder-schedule";

// Reference "now": 15 Sept 2026, 08:00 UTC (Ouagadougou is UTC+0).
const NOW = new Date("2026-09-15T08:00:00Z");

function classConfig(over: Partial<ClassReminderConfig> = {}): ClassReminderConfig {
  return {
    classId: "c1",
    reminderEnabled: true,
    reminderBeforeDays: 7,
    reminderAfterDays: [3, 10],
    reminderHour: "08:00",
    ...over,
  };
}

function student(over: Partial<StudentSnapshot> = {}): StudentSnapshot {
  return {
    studentId: "s1",
    classId: "c1",
    hasParentPhone: true,
    lastReminderAt: null,
    tranches: [],
    ...over,
  };
}

const noSent: SentIndex = new Map();

test("parseAfterDays reads the csv, sorts, drops junk", () => {
  assert.deepEqual(parseAfterDays("10, 3"), [3, 10]);
  assert.deepEqual(parseAfterDays("3,3,3"), [3]);
  assert.deepEqual(parseAfterDays(""), []);
  assert.deepEqual(parseAfterDays("abc,-2,0,5"), [5]);
  assert.deepEqual(parseAfterDays(null), []);
});

test("calendarDaysUntil counts whole UTC days regardless of the time of day", () => {
  assert.equal(calendarDaysUntil(new Date("2026-09-20T00:00:00Z"), NOW), 5);
  assert.equal(calendarDaysUntil(new Date("2026-09-20T23:00:00Z"), NOW), 5);
  assert.equal(calendarDaysUntil(new Date("2026-09-10T00:00:00Z"), NOW), -5);
});

test("a class only fires at its configured hour", () => {
  const students = [student({ tranches: [{ trancheId: "t1", remaining: 5000, dueDate: new Date("2026-09-18T00:00:00Z") }] })];
  const atNine = computeReminderActions({
    now: new Date("2026-09-15T09:00:00Z"),
    classes: [classConfig({ reminderHour: "08:00" })],
    students,
    sent: noSent,
  });
  assert.equal(atNine.length, 0);

  const atEight = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: noSent });
  assert.equal(atEight.length, 1);
  assert.equal(atEight[0].trigger, "auto_before");
});

test("a 'before' reminder fires once inside the window and never twice", () => {
  const students = [student({ tranches: [{ trancheId: "t1", remaining: 5000, dueDate: new Date("2026-09-20T00:00:00Z") }] })];

  const first = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: noSent });
  assert.equal(first.length, 1);
  assert.equal(first[0].trancheId, "t1");

  const already: SentIndex = new Map([["s1:t1", { auto_before: 1, auto_after: 0 }]]);
  const second = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: already });
  assert.equal(second.length, 0);
});

test("no reminder before the window opens", () => {
  const students = [student({ tranches: [{ trancheId: "t1", remaining: 5000, dueDate: new Date("2026-09-30T00:00:00Z") }] })];
  const actions = computeReminderActions({ now: NOW, classes: [classConfig({ reminderBeforeDays: 7 })], students, sent: noSent });
  assert.equal(actions.length, 0);
});

test("'after' reminders walk the configured offsets in order", () => {
  // Tranche due 8 days ago → 8 days late. Offsets [3, 10].
  const dueDate = new Date("2026-09-07T00:00:00Z");
  const students = [student({ tranches: [{ trancheId: "t1", remaining: 5000, dueDate }] })];

  const first = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: noSent });
  assert.equal(first.length, 1);
  assert.equal(first[0].trigger, "auto_after");
  assert.equal(first[0].offsetDays, 3);

  // The 3-day reminder was sent; 8 < 10 so nothing more yet.
  const afterFirst: SentIndex = new Map([["s1:t1", { auto_before: 0, auto_after: 1 }]]);
  const still = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: afterFirst });
  assert.equal(still.length, 0);

  // 11 days late now → the 10-day reminder is due.
  const later = new Date("2026-09-18T08:00:00Z");
  const second = computeReminderActions({ now: later, classes: [classConfig()], students, sent: afterFirst });
  assert.equal(second.length, 1);
  assert.equal(second[0].offsetDays, 10);
});

test("a family is not reminded twice within 72h", () => {
  const students = [
    student({
      lastReminderAt: new Date("2026-09-14T08:00:00Z"), // 24h ago
      tranches: [{ trancheId: "t1", remaining: 5000, dueDate: new Date("2026-09-18T00:00:00Z") }],
    }),
  ];
  const actions = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: noSent });
  assert.equal(actions.length, 0);
});

test("settled tranches, missing phones and disabled classes are ignored", () => {
  const due = new Date("2026-09-18T00:00:00Z");
  assert.equal(
    computeReminderActions({
      now: NOW,
      classes: [classConfig()],
      students: [student({ tranches: [{ trancheId: "t1", remaining: 0, dueDate: due }] })],
      sent: noSent,
    }).length,
    0
  );
  assert.equal(
    computeReminderActions({
      now: NOW,
      classes: [classConfig()],
      students: [student({ hasParentPhone: false, tranches: [{ trancheId: "t1", remaining: 5000, dueDate: due }] })],
      sent: noSent,
    }).length,
    0
  );
  assert.equal(
    computeReminderActions({
      now: NOW,
      classes: [classConfig({ reminderEnabled: false })],
      students: [student({ tranches: [{ trancheId: "t1", remaining: 5000, dueDate: due }] })],
      sent: noSent,
    }).length,
    0
  );
});

test("one reminder per student per run — overdue tranche wins over upcoming", () => {
  const students = [
    student({
      tranches: [
        { trancheId: "t1", remaining: 5000, dueDate: new Date("2026-09-05T00:00:00Z") }, // 10 days late
        { trancheId: "t2", remaining: 5000, dueDate: new Date("2026-09-18T00:00:00Z") }, // upcoming
      ],
    }),
  ];
  const actions = computeReminderActions({ now: NOW, classes: [classConfig()], students, sent: noSent });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].trancheId, "t1");
  assert.equal(actions[0].trigger, "auto_after");
});
