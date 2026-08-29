import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { NewStudentForm } from "./new-student-form";

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { classId } = await searchParams;
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId, archived: false },
    orderBy: { order: "asc" },
  });

  return <NewStudentForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} defaultClassId={classId} />;
}
