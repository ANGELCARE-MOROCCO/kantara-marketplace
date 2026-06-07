import { isAdminRole, requireUser } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function CreateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (user.role === "host_pending") redirect("/partner/dashboard");
  if (user.role !== "host_verified" && !isAdminRole(user.role)) redirect("/");

  return children;
}
