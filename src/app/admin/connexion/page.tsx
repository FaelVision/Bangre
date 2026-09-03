import { prisma } from "@/lib/db";
import { AdminLoginForm } from "./login-form";

export default async function AdminLoginPage() {
  const adminCount = await prisma.admin.count();
  return <AdminLoginForm hasAdmin={adminCount > 0} />;
}
