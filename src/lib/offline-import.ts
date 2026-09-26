"use client";

import { enqueue } from "@/lib/offline-queue";
import { loadLocalData } from "@/lib/offline-mirror";
import { looksLikePhone, type ParsedImport } from "@/lib/student-import";
import { nextMatricule, normalizeMatricule } from "@/lib/matricule";

/**
 * Importing a list with no network. The file is already read on the device
 * for the preview, so each recognised student goes to the outbox exactly as if
 * typed in the "nouvel élève" form — the same rules as the server import:
 * rows without both names are skipped, a matricule already used is refused.
 * They appear in the class at once and are created on the server at sync.
 */
export async function queueImport(classId: string, rows: ParsedImport["rows"]) {
  const data = await loadLocalData();
  const used = new Set((data?.students ?? []).map((s) => normalizeMatricule(s.matricule)));
  const skipped: string[] = [];
  let imported = 0;

  for (const row of rows) {
    if (!row.lastName || !row.firstName) {
      skipped.push(`Ligne ${row.line} : nom ou prénom manquant.`);
      continue;
    }
    const wanted = normalizeMatricule(row.matricule);
    if (wanted && used.has(wanted)) {
      skipped.push(`Ligne ${row.line} : le matricule ${wanted} est déjà utilisé.`);
      continue;
    }
    // Reserve the number here too, so the list shows the same matricules the
    // server is about to give (it re-checks them at sync).
    const matricule = wanted || nextMatricule([...used]);
    used.add(normalizeMatricule(matricule));

    await enqueue(
      {
        kind: "student.create",
        payload: {
          classId,
          matricule,
          lastName: row.lastName,
          firstName: row.firstName,
          birthDate: row.birthDate || undefined,
          gender: row.gender || undefined,
          parentName: row.parentName || undefined,
          parentPhone: looksLikePhone(row.parentPhone) ? row.parentPhone : undefined,
        },
      },
      `Import · ${row.lastName.toUpperCase()} ${row.firstName}`
    );
    imported += 1;
  }

  return { imported, skipped, queued: true as const };
}
