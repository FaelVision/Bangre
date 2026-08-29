import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getStudentsList } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { StudentsListView } from "@/components/students-list-view";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { q, statut, page } = await searchParams;

  const [result, classes] = await Promise.all([
    getStudentsList(schoolId, {
      q,
      statut: statut as never,
      page: page ? Number(page) : 1,
    }),
    prisma.schoolClass.findMany({ where: { schoolId, archived: false }, orderBy: { order: "asc" } }),
  ]);

  return (
    <StudentsListView
      title="Élèves"
      subtitle={`${result.total} élèves actifs`}
      basePath="/eleves"
      result={result}
      q={q}
      statut={statut}
      showClassColumn
      classOptions={classes.map((c) => ({ id: c.id, name: c.name }))}
      extraActions={
        <Link
          href="/eleves/nouveau"
          className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline hover:bg-(--color-primary-hover)"
        >
          + Ajouter un élève
        </Link>
      }
    />
  );
}
