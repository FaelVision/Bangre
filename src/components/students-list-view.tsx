import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { StudentsTable, type StudentRow } from "@/components/students-table";
import { ListFilters } from "@/components/list-filters";
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
      <div className="px-4 lg:px-7 pt-4.5 pb-10">
        <ListFilters
          basePath={basePath}
          currentParams={{ q, statut }}
          searchParam={{
            name: "q",
            placeholder: "Rechercher par nom, prénom ou matricule…",
            value: q,
          }}
          selects={[{ name: "statut", value: statut ?? "", options: statusOptions }]}
        />

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
