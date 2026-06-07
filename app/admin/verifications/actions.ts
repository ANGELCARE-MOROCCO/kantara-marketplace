"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  VERIFICATION_CATEGORIES,
  VERIFICATION_ENTITY_TYPES,
  VERIFICATION_STATUSES,
} from "@/app/lib/verificationOperations";

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function verificationsRedirect(params: Record<string, string | null | undefined> = {}): never {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  redirect(`/admin/verifications${search.toString() ? `?${search.toString()}` : ""}`);
}

function revalidateVerifications() {
  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
  revalidatePath("/admin/marketplace-operations");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/premium-guests");
  revalidatePath("/admin/handover");
}

export async function createVerificationRecordAction(formData: FormData) {
  const admin = await requireAdmin();
  const entityType = readString(formData, "entityType", 40);
  const entityId = readString(formData, "entityId", 120);
  const category = readString(formData, "category", 60);
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const evidenceSummary = readString(formData, "evidenceSummary", 2000);

  if (!VERIFICATION_ENTITY_TYPES.includes(entityType as any)) verificationsRedirect({ error: "Valid entity type is required." });
  if (!entityId) verificationsRedirect({ error: "Entity id is required." });
  if (!VERIFICATION_CATEGORIES.includes(category as any)) verificationsRedirect({ error: "Valid verification category is required." });
  if (!title) verificationsRedirect({ error: "Verification title is required." });

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.verificationRecord.create({
      data: {
        entityType: entityType as string,
        entityId,
        category: category as string,
        status: "pending",
        title,
        summary,
        evidenceSummary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: created.id,
        type: "created",
        message: "Verification record created. Sensitive document values were not stored.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "verifications",
      action: "create_verification",
      targetType: "VerificationRecord",
      targetId: created.id,
      summary: "Admin created a verification record.",
      metadata: { entityType, entityId, category },
    });
    return created;
  });

  revalidateVerifications();
  verificationsRedirect({ notice: "Verification record created.", verificationId: record.id });
}

export async function updateVerificationStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const verificationId = readString(formData, "verificationId", 80);
  const status = readString(formData, "status", 40);
  const message = readString(formData, "message", 2000) ?? "Verification status updated.";
  if (!verificationId) verificationsRedirect({ error: "Verification id is required." });
  if (!VERIFICATION_STATUSES.includes(status as any)) verificationsRedirect({ error: "Unsupported verification status.", verificationId });

  const record = await prisma.verificationRecord.findUnique({ where: { id: verificationId } });
  if (!record) verificationsRedirect({ error: "Verification record not found." });

  await prisma.$transaction(async (tx) => {
    await tx.verificationRecord.update({
      where: { id: record.id },
      data: {
        status: status as string,
        reviewedById: ["verified", "rejected", "needs_information", "expired"].includes(status as string)
          ? admin.id
          : record.reviewedById,
        reviewedAt: ["verified", "rejected", "needs_information", "expired"].includes(status as string)
          ? new Date()
          : record.reviewedAt,
        updatedById: admin.id,
      },
    });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: record.id,
        type: `status_${status}`,
        message,
        payload: { previousStatus: record.status, nextStatus: status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "verifications",
      action: "update_verification_status",
      targetType: "VerificationRecord",
      targetId: record.id,
      summary: `Verification moved to ${status}.`,
      metadata: { previousStatus: record.status, nextStatus: status },
    });
  });

  revalidateVerifications();
  verificationsRedirect({ notice: "Verification status updated.", verificationId: record.id });
}
