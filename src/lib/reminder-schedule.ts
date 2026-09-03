/**
 * Pure scheduling logic for the automatic WhatsApp reminders.
 *
 * Given, for one school, the reminder configuration of each class, the current
 * tranche state of every active student, and the reminders already sent, this
 * decides exactly which reminders should go out *now*. It touches no database
 * and no clock of its own — the caller passes `now` — so it is fully testable.
 *
 * The server-side orchestration (loading data, sending, recording) lives in
 * `reminders-core.ts`; the hourly entry point is `/api/cron/reminders`.
 */

export type AutoTrigger = "auto_before" | "auto_after";

export type ClassReminderConfig = {
  classId: string;
  reminderEnabled: boolean;
  /** Send a "before" reminder once the due date is this many days away or less. */
  reminderBeforeDays: number;
  /** Ascending day-offsets after the due date, e.g. [3, 10]. */
  reminderAfterDays: number[];
  /** "HH:MM" in Africa/Ouagadougou time (UTC+0 all year). */
  reminderHour: string;
};

export type TrancheSnapshot = {
  trancheId: string;
  /** Amount still owed on this tranche (> 0 means it is not settled). */
  remaining: number;
  dueDate: Date;
};

export type StudentSnapshot = {
  studentId: string;
  classId: string;
  hasParentPhone: boolean;
  /** Most recent reminder of any kind for this student, or null. */
  lastReminderAt: Date | null;
  tranches: TrancheSnapshot[];
};

/**
 * How many reminders were already sent for a given (student, tranche): one
 * count per automatic trigger. Key is `${studentId}:${trancheId}`.
 */
export type SentIndex = Map<string, { auto_before: number; auto_after: number }>;

export type ReminderAction = {
  studentId: string;
  classId: string;
  trancheId: string;
  trigger: AutoTrigger;
  /** The day-offset that matched (the before-days for "before"). */
  offsetDays: number;
};

/** Whole calendar days from `now` to `date`, counted on the UTC date only. */
export function calendarDaysUntil(date: Date, now: Date): number {
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

/** Parse the stored csv ("3,10") into a sorted, de-duplicated list of positive ints. */
export function parseAfterDays(raw: string | null | undefined): number[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ].sort((a, b) => a - b);
}

const MIN_HOURS_BETWEEN_REMINDERS = 72;

function sentKey(studentId: string, trancheId: string) {
  return `${studentId}:${trancheId}`;
}

/**
 * The reminders to send right now for one school.
 *
 * Rules:
 *  - A class only fires at its configured hour (so each class sends at most once
 *    per day), and only when reminders are enabled for it.
 *  - "before": one reminder per tranche, sent as soon as the due date is within
 *    `reminderBeforeDays` days (and not yet past).
 *  - "after": one reminder per configured offset, in order — the k-th offset
 *    fires once the tranche is at least `reminderAfterDays[k]` days late.
 *  - A student who received any reminder in the last 72h is skipped this run,
 *    so a family is never flooded.
 *  - Settled tranches (remaining <= 0) and students with no parent phone are
 *    ignored.
 */
export function computeReminderActions(params: {
  now: Date;
  classes: ClassReminderConfig[];
  students: StudentSnapshot[];
  sent: SentIndex;
}): ReminderAction[] {
  const { now, classes, students, sent } = params;
  const currentHour = now.getUTCHours();

  const activeClasses = new Map<string, ClassReminderConfig>();
  for (const c of classes) {
    if (!c.reminderEnabled) continue;
    const hour = Number(String(c.reminderHour).split(":")[0]);
    if (!Number.isInteger(hour) || hour !== currentHour) continue;
    activeClasses.set(c.classId, c);
  }
  if (activeClasses.size === 0) return [];

  const actions: ReminderAction[] = [];

  for (const student of students) {
    const config = activeClasses.get(student.classId);
    if (!config) continue;
    if (!student.hasParentPhone) continue;

    if (student.lastReminderAt) {
      const hoursSince = (now.getTime() - student.lastReminderAt.getTime()) / 3_600_000;
      if (hoursSince < MIN_HOURS_BETWEEN_REMINDERS) continue;
    }

    // One reminder per student per run: pick the most urgent tranche.
    const candidates: ReminderAction[] = [];

    for (const tranche of student.tranches) {
      if (tranche.remaining <= 0) continue;
      const daysUntil = calendarDaysUntil(tranche.dueDate, now);
      const counts = sent.get(sentKey(student.studentId, tranche.trancheId)) ?? {
        auto_before: 0,
        auto_after: 0,
      };

      if (daysUntil <= 0) {
        // Overdue — walk the configured offsets in order.
        const daysLate = -daysUntil;
        const nextOffset = config.reminderAfterDays[counts.auto_after];
        if (nextOffset !== undefined && daysLate >= nextOffset) {
          candidates.push({
            studentId: student.studentId,
            classId: student.classId,
            trancheId: tranche.trancheId,
            trigger: "auto_after",
            offsetDays: nextOffset,
          });
        }
      } else if (daysUntil <= config.reminderBeforeDays && counts.auto_before === 0) {
        candidates.push({
          studentId: student.studentId,
          classId: student.classId,
          trancheId: tranche.trancheId,
          trigger: "auto_before",
          offsetDays: config.reminderBeforeDays,
        });
      }
    }

    if (candidates.length === 0) continue;
    // Overdue beats upcoming; among overdue, the longest-late (largest offset).
    candidates.sort((a, b) => {
      if (a.trigger !== b.trigger) return a.trigger === "auto_after" ? -1 : 1;
      return b.offsetDays - a.offsetDays;
    });
    actions.push(candidates[0]);
  }

  return actions;
}
