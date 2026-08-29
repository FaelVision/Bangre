import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { StudentsTable, type StudentRow } from "@/components/students-table";
import type { getStudentsList } from "@/lib/queries";

type Result = Awaited<ReturnType<typeof getStudentsList>>;

export function StudentsListView({
  title,
  subtitle,
  eyebrow,
  basePath,
  result,
  q,
  statut,
  showClassColumn,
  classOptions,
  extraActions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  basePath: string;
  result: Result;
  q?: string;
  statut?: string;
  showClassColumn: boolean;
  classOptions?: { id: string; name: string }[];
  extraActions?: React.ReactNode;
}) {
  const rows: StudentRow[] = result.rows.map(({ student, summary }) => ({
    id: student.id,
    matricule: student.matricule,
    lastName: student.lastName,
    firstName: student.firstName,
    birthDate: student.birthDate,
    parentPhone: student.parentPhone,
    className: student.class.name,
    summary,
  }));

  const statusOptions = [
    { value: "", label: "Statut : tous" },
    { value: "solde", label: "Soldé" },
    { value: "partiel", label: "Partiel" },
    { value: "retard", label: "En retard" },
    { value: "attente", label: "En attente" },
  ];

  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={extraActions} />
      <div className="px-7 pt-4.5 pb-10">
        <form action={basePath} className="flex gap-2.5 items-center mb-3.5 flex-wrap">
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom, prénom ou matricule…"
            className="flex-1 min-w-[220px] h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3.5 text-[13.5px] placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary)"
          />
          <select
            name="statut"
            defaultValue={statut ?? ""}
            className="h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3 text-[13.5px] min-w-[150px]"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-4 text-[13.5px] font-semibold cursor-pointer"
          >
            Filtrer
          </button>
        </form>

        <StudentsTable students={rows} showClassColumn={showClassColumn} classOptions={classOptions} />

        <div className="flex items-center justify-between mt-3.5 text-[13px] text-(--color-text-muted)">
          <span className="tabular-nums">
            {result.total === 0
              ? "0 élève"
              : `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} sur ${result.total}`}
          </span>
          {result.pageCount > 1 && (
            <div className="flex gap-1.5">
              {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(statut ? { statut } : {}), page: String(p) }).toString()}`}
                  className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center text-[12.5px] no-underline hover:no-underline ${
                    p === result.page
                      ? "bg-[#221E1A] text-white border-[#221E1A]"
                      : "border-(--color-border-strong) bg-white text-(--color-text)"
                  }`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
