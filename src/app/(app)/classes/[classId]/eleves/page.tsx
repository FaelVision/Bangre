import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getStudentsList } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { StudentsListView } from "@/components/students-list-view";

export default async function ClassStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const { classId } = await params;
  const { schoolId } = await verifySession();
  const { q, statut, page } = await searchParams;

  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) notFound();

  const result = await getStudentsList(schoolId, {
    classId,
    q,
    statut: statut as never,
    page: page ? Number(page) : 1,
  });

  return (
    <StudentsListView
      eyebrow={
        <>
          <Link href="/classes" className="text-(--color-primary) font-medium">
            Classes
          </Link>{" "}
          › {clazz.name}
        </>
      }
      title={
        <>
          Élèves de la {clazz.name}{" "}
          <span className="text-[14px] text-(--color-text-muted) font-normal">· {result.total} élèves</span>
        </>
      }
      basePath={`/classes/${classId}/eleves`}
      result={result}
      q={q}
      statut={statut}
      showClassColumn={false}
      extraActions={
        <>
          <Link
            href={`/classes/${classId}/eleves/importer`}
            className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Importer Excel / CSV
          </Link>
          <Link
            href={`/eleves/nouveau?classId=${classId}`}
            className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline hover:bg-(--color-primary-hover)"
          >
            + Ajouter un élève
          </Link>
        </>
      }
    />
  );
}
