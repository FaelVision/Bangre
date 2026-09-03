"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { importStudentsCsvAction } from "@/lib/actions/students";
import {
  FIELD_LABELS,
  parseStudentsFile,
  parseStudentsRows,
  rowsFromColumns,
  columnsFromMapping,
  type ParsedImport,
  type StudentField,
} from "@/lib/student-import";
import { xlsxToRows } from "@/lib/xlsx";
import { Button, Card } from "@/components/ui";
import { Select } from "@/components/form";

const PREVIEW_ROWS = 5;

/** The choices offered for every column, in the order they read best. */
const FIELD_OPTIONS = Object.keys(FIELD_LABELS) as StudentField[];

type Mapping = Record<number, StudentField | "">;

async function readFile(file: File): Promise<ParsedImport> {
  if (/\.xlsx$/i.test(file.name)) {
    return parseStudentsRows(xlsxToRows(new Uint8Array(await file.arrayBuffer())));
  }
  return parseStudentsFile(await file.text());
}

export function ImportForm({ classId, className }: { classId: string; className: string }) {
  const boundAction = importStudentsCsvAction.bind(null, classId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);
  // The file is read here too, so the secretary sees what was recognised — and
  // can correct it — before importing anything. The server reads it again and
  // applies the same mapping.
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? "");
    setReadError("");
    if (!file) {
      setPreview(null);
      setMapping({});
      return;
    }
    try {
      const parsed = await readFile(file);
      const initial: Mapping = {};
      for (const column of parsed.columns) initial[column.index] = column.field;
      setPreview(parsed);
      setMapping(initial);
    } catch {
      setPreview(null);
      setMapping({});
      setReadError(
        "Ce fichier Excel n'a pas pu être lu. Enregistrez-le au format CSV (Fichier › Enregistrer sous › CSV) et réessayez."
      );
    }
  }

  // Which columns to offer a choice for: those with a header or any value.
  const activeColumns = useMemo(() => {
    if (!preview) return [];
    const indexes: number[] = [];
    for (let i = 0; i < preview.width; i += 1) {
      const hasHeader = (preview.headers?.[i] ?? "").trim() !== "";
      const hasValue = preview.dataGrid.some((r) => (r.cells[i] ?? "").trim() !== "");
      if (hasHeader || hasValue) indexes.push(i);
    }
    return indexes;
  }, [preview]);

  const sampleValues = (index: number) =>
    preview
      ? preview.dataGrid
          .map((r) => (r.cells[index] ?? "").trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(", ")
      : "";

  // The mapping the user currently has, rebuilt into rows the same way the
  // server will. Everything shown below reacts to this.
  const effective = useMemo(() => {
    if (!preview) return { columns: [], rows: [] as ParsedImport["rows"] };
    const columns = columnsFromMapping(mapping, preview.headers);
    return { columns, rows: rowsFromColumns(preview.dataGrid, columns) };
  }, [preview, mapping]);

  const chosen = new Set(Object.values(mapping).filter(Boolean));
  const hasNames = chosen.has("lastName") || chosen.has("fullName");
  const incomplete = effective.rows.filter((r) => !r.lastName || !r.firstName).length;
  const ageOnly = chosen.has("age") && !chosen.has("birthDate");

  function setColumn(index: number, field: StudentField | "") {
    setMapping((current) => ({ ...current, [index]: field }));
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href={`/classes/${classId}/eleves`} className="text-(--color-primary) font-medium">
          Élèves de la {className}
        </Link>{" "}
        › Import
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Importer des élèves</div>

      <Card>
        <div className="text-[13px] text-(--color-text-secondary) leading-relaxed mb-4">
          Envoyez la liste que vous avez déjà — un fichier Excel (.xlsx) ou CSV. Les colonnes peuvent
          être dans n&apos;importe quel ordre et porter n&apos;importe quel intitulé : il suffit que
          l&apos;information soit dans le fichier. L&apos;application reconnaît elle-même le matricule,
          le nom, le prénom, la date de naissance, l&apos;âge, le sexe et le numéro du parent, et vous
          pouvez corriger chaque colonne avant d&apos;importer.
          <div className="mt-2 text-(--color-text-muted)">
            Seuls le nom et le prénom sont indispensables — ils peuvent tenir dans une seule colonne
            («&nbsp;OUEDRAOGO Ali&nbsp;»). La date s&apos;écrit indifféremment 26/11/2006 ou
            2006-11-26 ; sans matricule, un numéro est attribué automatiquement.
          </div>
        </div>

        <form action={formAction} className="grid gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label
              htmlFor="import-file"
              className="h-9 px-3.5 rounded-lg border border-(--color-border-strong) bg-white text-[13px] font-semibold cursor-pointer inline-flex items-center hover:bg-(--color-bg-subtle)"
            >
              Choisissez un fichier
            </label>
            <span className="text-[13px] text-(--color-text-muted) truncate max-w-[220px]">
              {fileName || "Aucun fichier sélectionné"}
            </span>
            <input
              id="import-file"
              type="file"
              name="file"
              accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={onFileChange}
              className="sr-only"
            />
          </div>

          <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />

          {readError && <div className="text-[12.5px] text-(--color-danger-text)">{readError}</div>}

          {preview && (
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) p-3.5">
              <div className="text-[13px] font-semibold mb-2">
                {effective.rows.length} élève(s) lu(s) dans {fileName || "le fichier"}
              </div>

              {activeColumns.length > 0 && (
                <div className="grid gap-2 mb-3">
                  <div className="text-[12px] font-semibold text-(--color-text-muted)">
                    Colonnes du fichier — vérifiez la correspondance :
                  </div>
                  {activeColumns.map((index) => {
                    const header = (preview.headers?.[index] ?? "").trim();
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_11rem]"
                      >
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-medium truncate">
                            {header || `Colonne ${index + 1}`}
                          </div>
                          <div className="text-[11.5px] text-(--color-text-muted) truncate">
                            {sampleValues(index) || "—"}
                          </div>
                        </div>
                        <Select
                          aria-label={`Colonne ${index + 1}`}
                          className="h-9 text-[12.5px]"
                          value={mapping[index] ?? ""}
                          onChange={(e) => setColumn(index, e.target.value as StudentField | "")}
                        >
                          <option value="">— Ignorer —</option>
                          {FIELD_OPTIONS.map((field) => (
                            <option key={field} value={field}>
                              {FIELD_LABELS[field]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              {!hasNames && (
                <div className="text-[12.5px] text-(--color-danger-text)">
                  Aucune colonne n&apos;est associée au nom — choisissez « Nom » (et « Prénom »), ou
                  « Nom et prénom » si les deux sont dans la même colonne.
                </div>
              )}
              {incomplete > 0 && (
                <div className="text-[12.5px] text-(--color-text-muted)">
                  {incomplete} ligne(s) sans nom ou sans prénom seront ignorées.
                </div>
              )}
              {ageOnly && (
                <div className="text-[12.5px] text-(--color-text-muted)">
                  L&apos;âge est reconnu mais n&apos;est pas conservé : la fiche élève enregistre la
                  date de naissance.
                </div>
              )}

              {effective.rows.length > 0 && (
                <div className="overflow-x-auto mt-2.5">
                  <table className="w-full text-[12.5px] border-collapse">
                    <thead>
                      <tr className="text-left text-(--color-text-muted)">
                        <th className="font-medium py-1 pr-3">Matricule</th>
                        <th className="font-medium py-1 pr-3">Nom</th>
                        <th className="font-medium py-1 pr-3">Prénom</th>
                        <th className="font-medium py-1 pr-3">Naissance</th>
                        <th className="font-medium py-1">Parent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effective.rows.slice(0, PREVIEW_ROWS).map((row) => (
                        <tr key={row.line} className="border-t border-(--color-border)">
                          <td className="py-1 pr-3 whitespace-nowrap">{row.matricule || "—"}</td>
                          <td className="py-1 pr-3 whitespace-nowrap font-medium">{row.lastName || "—"}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.firstName || "—"}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.birthDate || "—"}</td>
                          <td className="py-1 whitespace-nowrap">{row.parentPhone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {effective.rows.length > PREVIEW_ROWS && (
                    <div className="text-[12px] text-(--color-text-muted) pt-1.5">
                      … et {effective.rows.length - PREVIEW_ROWS} autre(s).
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}
          {state?.skipped && (
            <div className="text-[13px] text-(--color-text-secondary)">
              <div className="font-semibold">
                {state.imported} élève(s) importé(s), {state.skipped.length} ligne(s) ignorée(s) :
              </div>
              <ul className="list-disc pl-5 mt-1 text-(--color-text-muted)">
                {state.skipped.slice(0, 5).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {state.skipped.length > 5 && <li>… et {state.skipped.length - 5} autre(s).</li>}
              </ul>
            </div>
          )}

          <div className="flex gap-2.5">
            <Link
              href={`/classes/${classId}/eleves`}
              className="flex-1 h-[42px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              {state?.skipped ? "Terminer" : "Annuler"}
            </Link>
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              disabled={pending || (preview !== null && !hasNames)}
            >
              {pending ? "Import en cours…" : "Importer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
