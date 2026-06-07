"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminRole, requireAdmin, requireUser } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  ACTIVE_PARTNER_APPLICATION_STATUSES,
  APPLICANT_TYPES,
  MOROCCO_CITIES,
  PARTNER_RISK_LEVELS,
  PAYOUT_PREFERENCES,
  PREFERRED_LANGUAGES,
  PROPERTY_TYPE_OPTIONS,
  calculatePartnerReadinessScore,
  getMinimumSubmissionIssues,
  normalizeStringList,
} from "@/app/lib/partner";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readNullableString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value ? value : null;
}

function readBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function readPositiveInt(formData: FormData, key: string) {
  const value = Number(readString(formData, key));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function readAllowedValue(
  formData: FormData,
  key: string,
  allowedValues: readonly string[]
) {
  const value = readString(formData, key);
  return allowedValues.includes(value) ? value : null;
}

function readAllowedOptionValue(
  formData: FormData,
  key: string,
  options: readonly { readonly value: string }[]
) {
  return readAllowedValue(
    formData,
    key,
    options.map((option) => option.value)
  );
}

function readAllowedList(
  formData: FormData,
  key: string,
  allowedValues: readonly string[]
) {
  const values = formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter((value) => allowedValues.includes(value));

  return normalizeStringList(values);
}

function buildPartnerApplicationInput(formData: FormData) {
  const operatingCities = readAllowedList(formData, "operatingCities", MOROCCO_CITIES);
  const propertyTypes = readAllowedList(
    formData,
    "propertyTypes",
    PROPERTY_TYPE_OPTIONS.map((option) => option.value)
  );

  return {
    applicantType: readAllowedOptionValue(formData, "applicantType", APPLICANT_TYPES),
    legalName: readNullableString(formData, "legalName"),
    displayName: readNullableString(formData, "displayName"),
    primaryContactName: readNullableString(formData, "primaryContactName"),
    email: readNullableString(formData, "email"),
    phone: readNullableString(formData, "phone"),
    whatsapp: readNullableString(formData, "whatsapp"),
    preferredLanguage: readAllowedOptionValue(
      formData,
      "preferredLanguage",
      PREFERRED_LANGUAGES
    ),
    country: readNullableString(formData, "country") ?? "Morocco",
    city: readAllowedValue(formData, "city", MOROCCO_CITIES),
    operatingCities,
    address: readNullableString(formData, "address"),
    companyName: readNullableString(formData, "companyName"),
    companyRegistrationNumber: readNullableString(
      formData,
      "companyRegistrationNumber"
    ),
    taxIdentifier: readNullableString(formData, "taxIdentifier"),
    nationalIdOrPassport: readNullableString(formData, "nationalIdOrPassport"),
    propertyTypes: propertyTypes.length > 0 ? propertyTypes.join(",") : null,
    estimatedPropertyCount: readPositiveInt(formData, "estimatedPropertyCount"),
    currentPortfolioSize: readPositiveInt(formData, "currentPortfolioSize"),
    hasExclusiveRights: readBoolean(formData, "hasExclusiveRights"),
    canProvideInvoices: readBoolean(formData, "canProvideInvoices"),
    hasPropertyDocuments: readBoolean(formData, "hasPropertyDocuments"),
    hasTourismAuthorization: readBoolean(formData, "hasTourismAuthorization"),
    acceptsPlatformRules: readBoolean(formData, "acceptsPlatformRules"),
    acceptsManagedCommunication: readBoolean(
      formData,
      "acceptsManagedCommunication"
    ),
    acceptsHandoverPolicy: readBoolean(formData, "acceptsHandoverPolicy"),
    acceptsCommissionModel: readBoolean(formData, "acceptsCommissionModel"),
    payoutPreference: readAllowedOptionValue(
      formData,
      "payoutPreference",
      PAYOUT_PREFERENCES
    ),
    businessExperience: readNullableString(formData, "businessExperience"),
    operationalCapacity: readNullableString(formData, "operationalCapacity"),
    checkInProcess: readNullableString(formData, "checkInProcess"),
    guestSupportCapacity: readNullableString(formData, "guestSupportCapacity"),
    cleaningProcess: readNullableString(formData, "cleaningProcess"),
    maintenanceProcess: readNullableString(formData, "maintenanceProcess"),
    emergencyContactName: readNullableString(formData, "emergencyContactName"),
    emergencyContactPhone: readNullableString(formData, "emergencyContactPhone"),
  };
}

function appendQuery(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function getSafeAdminReturnPath(formData: FormData) {
  const returnTo = readString(formData, "returnTo");
  return returnTo.startsWith("/admin/partners") ||
    returnTo.startsWith("/admin/partner-operations")
    ? returnTo
    : "/admin/partner-operations";
}

function readAdminRiskLevel(formData: FormData) {
  return readAllowedOptionValue(formData, "internalRiskLevel", PARTNER_RISK_LEVELS);
}

function buildAdminReviewFields(formData: FormData) {
  const adminNotes = readNullableString(formData, "adminNotes");
  const internalRiskLevel = readAdminRiskLevel(formData);

  return {
    ...(adminNotes ? { adminNotes } : {}),
    ...(internalRiskLevel ? { internalRiskLevel } : {}),
  };
}

async function getPartnerApplicationForAdmin(
  applicationId: string,
  returnTo: string
) {
  const application = await prisma.partnerApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  if (!application) {
    redirect(appendQuery(returnTo, "error", "Partner application not found."));
  }

  return application;
}

export async function upsertPartnerApplication(formData: FormData) {
  const user = await requireUser();

  if (user.role === "host_verified") {
    redirect("/partner/dashboard");
  }

  const intent = readString(formData, "intent") === "draft" ? "draft" : "submit";
  const input = buildPartnerApplicationInput(formData);
  const readinessScore = calculatePartnerReadinessScore(input);

  const latestApplication = await prisma.partnerApplication.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (latestApplication?.status === "approved" && !isAdminRole(user.role)) {
    redirect("/partner/dashboard");
  }

  if (latestApplication?.status === "suspended") {
    redirect("/partner/apply?error=suspended-application");
  }

  const activeApplication = await prisma.partnerApplication.findFirst({
    where: {
      userId: user.id,
      status: {
        in: [...ACTIVE_PARTNER_APPLICATION_STATUSES],
      },
    },
  });

  if (activeApplication) {
    redirect("/partner/apply?error=active-application");
  }

  if (intent === "submit") {
    const issues = getMinimumSubmissionIssues(input);

    if (issues.length > 0) {
      redirect("/partner/apply?error=missing-required-fields");
    }
  }

  const status = intent === "draft" ? "draft" : "submitted";
  const submittedAt = intent === "draft" ? null : new Date();
  const updateExisting =
    latestApplication &&
    ["draft", "needs_information", "rejected"].includes(latestApplication.status);

  await prisma.$transaction(async (tx) => {
    if (updateExisting) {
      await tx.partnerApplication.update({
        where: { id: latestApplication.id },
        data: {
          ...input,
          status,
          readinessScore,
          submittedAt,
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null,
          needsInformationReason: null,
        },
      });
    } else {
      await tx.partnerApplication.create({
        data: {
          ...input,
          status,
          readinessScore,
          submittedAt,
          userId: user.id,
        },
      });
    }

    if (intent === "submit" && user.role === "guest_basic") {
      await tx.user.update({
        where: { id: user.id },
        data: { role: "host_pending" },
      });
    }
  });

  revalidatePath("/partner/apply");
  revalidatePath("/partner/dashboard");
  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");

  if (intent === "draft") {
    redirect("/partner/apply?saved=1");
  }

  redirect("/partner/apply?submitted=1");
}

export async function markPartnerApplicationUnderReview(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = getSafeAdminReturnPath(formData);
  const applicationId = readString(formData, "applicationId");
  const application = await getPartnerApplicationForAdmin(applicationId, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: "under_review",
        reviewedById: admin.id,
        submittedAt: application.submittedAt ?? new Date(),
        ...buildAdminReviewFields(formData),
      },
    });

    if (!isAdminRole(application.user.role) && application.user.role === "guest_basic") {
      await tx.user.update({
        where: { id: application.user.id },
        data: { role: "host_pending" },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "partner_operations",
      action: "mark_under_review",
      targetType: "PartnerApplication",
      targetId: application.id,
      summary: "Partner application marked under review.",
      metadata: { previousStatus: application.status, nextStatus: "under_review" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/partner/dashboard");
  redirect(appendQuery(returnTo, "updated", "under-review"));
}

export async function requestPartnerApplicationInformation(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = getSafeAdminReturnPath(formData);
  const applicationId = readString(formData, "applicationId");
  const reason = readNullableString(formData, "needsInformationReason");

  if (!reason) {
    redirect(appendQuery(returnTo, "error", "Information request reason is required."));
  }

  const application = await getPartnerApplicationForAdmin(applicationId, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: "needs_information",
        needsInformationReason: reason,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        ...buildAdminReviewFields(formData),
      },
    });

    if (!isAdminRole(application.user.role) && application.user.role === "guest_basic") {
      await tx.user.update({
        where: { id: application.user.id },
        data: { role: "host_pending" },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "partner_operations",
      action: "request_information",
      targetType: "PartnerApplication",
      targetId: application.id,
      summary: "Partner application moved to needs information.",
      metadata: { previousStatus: application.status, nextStatus: "needs_information" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/partner/apply");
  revalidatePath("/partner/dashboard");
  redirect(appendQuery(returnTo, "updated", "needs-information"));
}

export async function approvePartnerApplication(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = getSafeAdminReturnPath(formData);
  const applicationId = readString(formData, "applicationId");
  const application = await getPartnerApplicationForAdmin(applicationId, returnTo);

  const minimumIssues = getMinimumSubmissionIssues(application);
  if (minimumIssues.length > 0) {
    redirect(appendQuery(returnTo, "error", `Approval blocked: missing ${minimumIssues.slice(0, 3).join(", ")}.`));
  }

  const [verifiedPartnerRecord, rejectedPartnerRecord, severeDispute] = await Promise.all([
    prisma.verificationRecord.findFirst({
      where: {
        entityType: "partner",
        entityId: { in: [application.userId, application.id] },
        status: "verified",
      },
      select: { id: true },
    }),
    prisma.verificationRecord.findFirst({
      where: {
        entityType: "partner",
        entityId: { in: [application.userId, application.id] },
        status: "rejected",
      },
      select: { id: true },
    }),
    prisma.disputeCase.findFirst({
      where: {
        partnerId: application.userId,
        status: { notIn: ["resolved", "closed"] },
        priority: { in: ["high", "urgent"] },
      },
      select: { id: true, caseNumber: true },
    }),
  ]);

  if (rejectedPartnerRecord) {
    redirect(appendQuery(returnTo, "error", "Approval blocked: a partner verification record is rejected."));
  }
  if (!verifiedPartnerRecord) {
    redirect(appendQuery(returnTo, "error", "Approval blocked: create and verify a partner authorization/compliance record first."));
  }
  if (severeDispute) {
    redirect(appendQuery(returnTo, "error", `Approval blocked: unresolved high/urgent dispute ${severeDispute.caseNumber}.`));
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: "approved",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: null,
        needsInformationReason: null,
        ...buildAdminReviewFields(formData),
      },
    });

    if (!isAdminRole(application.user.role)) {
      await tx.user.update({
        where: { id: application.user.id },
        data: { role: "host_verified" },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "partner_operations",
      action: "approve_application",
      targetType: "PartnerApplication",
      targetId: application.id,
      summary: "Partner application approved.",
      metadata: { previousStatus: application.status, nextStatus: "approved" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/partner/apply");
  revalidatePath("/partner/dashboard");
  revalidatePath("/my-homes");
  revalidatePath("/create");
  redirect(appendQuery(returnTo, "updated", "approved"));
}

export async function rejectPartnerApplication(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = getSafeAdminReturnPath(formData);
  const applicationId = readString(formData, "applicationId");
  const rejectionReason = readNullableString(formData, "rejectionReason");

  if (!rejectionReason) {
    redirect(appendQuery(returnTo, "error", "Rejection reason is required."));
  }

  const application = await getPartnerApplicationForAdmin(applicationId, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: "rejected",
        rejectionReason,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        needsInformationReason: null,
        ...buildAdminReviewFields(formData),
      },
    });

    if (!isAdminRole(application.user.role)) {
      await tx.user.update({
        where: { id: application.user.id },
        data: { role: "guest_basic" },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "partner_operations",
      action: "reject_application",
      targetType: "PartnerApplication",
      targetId: application.id,
      summary: "Partner application rejected.",
      metadata: { previousStatus: application.status, nextStatus: "rejected" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/partner/apply");
  revalidatePath("/partner/dashboard");
  redirect(appendQuery(returnTo, "updated", "rejected"));
}

export async function suspendPartnerApplication(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = getSafeAdminReturnPath(formData);
  const applicationId = readString(formData, "applicationId");
  const application = await getPartnerApplicationForAdmin(applicationId, returnTo);

  if (isAdminRole(application.user.role)) {
    redirect(appendQuery(returnTo, "error", "Admin users cannot be suspended."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: "suspended",
        internalRiskLevel: "blocked",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        ...buildAdminReviewFields(formData),
      },
    });

    if (application.user.role === "host_verified") {
      await tx.user.update({
        where: { id: application.user.id },
        data: { role: "host_pending" },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "partner_operations",
      action: "suspend_application",
      targetType: "PartnerApplication",
      targetId: application.id,
      summary: "Partner application suspended.",
      metadata: { previousStatus: application.status, nextStatus: "suspended" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partner-operations");
  revalidatePath("/partner/dashboard");
  revalidatePath("/my-homes");
  revalidatePath("/create");
  redirect(appendQuery(returnTo, "updated", "suspended"));
}
