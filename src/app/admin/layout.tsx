import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bangre — Administration",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-(--color-bg-page)">{children}</div>;
}
