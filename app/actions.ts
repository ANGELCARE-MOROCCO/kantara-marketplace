"use server";

import { redirect } from "next/navigation";
import prisma from "./lib/db";
import { supabase } from "./lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  canManageListings,
  isAdminRole,
  requireListingEditor,
  requireListingPublisher,
  requireUser,
} from "./lib/auth";
import { getCurrencySettings } from "./lib/currency";
import { TRANSLATIONS_CACHE_TAG } from "./lib/i18n";
import { getPropertyFeatureByKey } from "./lib/propertyFeatures";
import type { Prisma } from "@prisma/client";

const MAX_HOME_IMAGES = 10;
const MILLISECONDS_PER_NIGHT = 24 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = ["requested", "reserved", "confirmed"];

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;
type PriceComparableHome = {
  price: number | null;
  cleaningFee: number | null;
  securityDeposit: number | null;
  minimumNights: number | null;
  maximumNights: number | null;
};

function serializeMetadata(metadata?: Record<string, unknown> | string | null) {
  if (!metadata) return null;
  if (typeof metadata === "string") return metadata;

  return JSON.stringify(metadata);
}

function valuesChanged<T>(previous: T, next: T) {
  return previous !== next;
}

function stringSetsEqual(first: Set<string>, second: Set<string>) {
  if (first.size !== second.size) return false;

  return Array.from(first).every((value) => second.has(value));
}

function getReservationNightCount(startDate: Date, endDate: Date) {
  const nights = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_NIGHT
  );

  return nights > 0 ? nights : 0;
}

function revalidateListingPaths(homeId: string) {
  revalidateTag(TRANSLATIONS_CACHE_TAG);
  revalidatePath("/my-homes");
  revalidatePath("/");
  revalidatePath(`/home/${homeId}`);
}

function pricingFieldsChanged(
  previous: PriceComparableHome,
  next: PriceComparableHome
) {
  return (
    previous.price !== next.price ||
    previous.cleaningFee !== next.cleaningFee ||
    previous.securityDeposit !== next.securityDeposit ||
    previous.minimumNights !== next.minimumNights ||
    previous.maximumNights !== next.maximumNights
  );
}

export async function requireHomeOwnerOrAdmin(homeId: string) {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (user.role === "host_pending") redirect("/partner/dashboard");
  if (!canManageListings(user.role)) redirect("/");

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      userId: true,
      title: true,
      listingStatus: true,
      contentReviewStatus: true,
    },
  });

  if (!home) redirect("/");
  if (home.userId !== user.id && !isAdminRole(user.role)) redirect("/");

  return { user, home };
}

export async function createListingAuditEvent({
  tx,
  homeId,
  actorId,
  eventType,
  message,
  metadata,
}: {
  tx?: PrismaExecutor;
  homeId?: string | null;
  actorId?: string | null;
  eventType: string;
  message?: string | null;
  metadata?: Record<string, unknown> | string | null;
}) {
  const client = tx ?? prisma;

  await client.listingAuditEvent.create({
    data: {
      homeId: homeId ?? null,
      actorId: actorId ?? null,
      eventType,
      message: message ?? null,
      metadata: serializeMetadata(metadata),
    },
  });
}

export async function createListingPriceHistoryIfChanged({
  tx,
  homeId,
  changedById,
  previous,
  next,
  reason,
}: {
  tx?: PrismaExecutor;
  homeId: string;
  changedById?: string | null;
  previous: PriceComparableHome;
  next: PriceComparableHome;
  reason?: string | null;
}) {
  if (!pricingFieldsChanged(previous, next)) return false;

  const client = tx ?? prisma;

  await client.listingPriceHistory.create({
    data: {
      homeId,
      changedById: changedById ?? null,
      oldPrice: previous.price,
      newPrice: next.price,
      oldCleaningFee: previous.cleaningFee,
      newCleaningFee: next.cleaningFee,
      oldSecurityDeposit: previous.securityDeposit,
      newSecurityDeposit: next.securityDeposit,
      oldMinimumNights: previous.minimumNights,
      newMinimumNights: next.minimumNights,
      oldMaximumNights: previous.maximumNights,
      newMaximumNights: next.maximumNights,
      reason: reason ?? null,
    },
  });

  return true;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInt(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.trunc(parsed);
}

function readIntFromAny(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const value = readInt(formData, key);
    if (value !== null) return value;
  }

  return null;
}

function readFloat(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(formData: FormData, key: string, defaultValue: boolean) {
  const values = formData.getAll(key);
  const value = values[values.length - 1];
  if (typeof value !== "string") return defaultValue;

  return value === "on" || value === "true" || value === "1";
}

function getImageFiles(formData: FormData) {
  return [...formData.getAll("images"), ...formData.getAll("image")].filter(
    (value): value is File =>
      value instanceof File && value.size > 0 && value.name.trim().length > 0
  );
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "property-image";
}

async function uploadHomeImages(homeId: string, files: File[]) {
  const uploadedPaths: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];

    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be uploaded to a property gallery.");
    }

    const storagePath = `${homeId}/${Date.now()}-${index}-${sanitizeFileName(
      file.name
    )}`;

    const { data, error } = await supabase.storage
      .from("images")
      .upload(storagePath, file, {
        cacheControl: "2592000",
        contentType: file.type,
        upsert: false,
      });

    if (error || !data?.path) {
      throw new Error(error?.message ?? "Image upload failed.");
    }

    uploadedPaths.push(data.path);
  }

  return uploadedPaths;
}

export async function createKantaraHome({ userId }: { userId: string }) {
  const user = await requireListingPublisher();
  if (userId !== user.id) redirect("/");

  const data = await prisma.home.findFirst({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAT: "desc",
    },
  });

  if (data === null) {
    const data = await prisma.home.create({
      data: {
        userId: user.id,
        country: "MA",
        listingStatus: "draft",
        contentReviewStatus: "draft",
      },
    });

    await createListingAuditEvent({
      homeId: data.id,
      actorId: user.id,
      eventType: "listing_created",
      message: "Listing draft created.",
      metadata: { listingStatus: "draft" },
    });

    return redirect(`/create/${data.id}/structure`);
  } else if (
    !data.addedCategory &&
    !data.addedDescription &&
    !data.addedLoaction
  ) {
    return redirect(`/create/${data.id}/structure`);
  } else if (data.addedCategory && !data.addedDescription) {
    return redirect(`/create/${data.id}/description`);
  } else if (
    data.addedCategory &&
    data.addedDescription &&
    !data.addedLoaction
  ) {
    return redirect(`/create/${data.id}/address`);
  } else if (
    data.addedCategory &&
    data.addedDescription &&
    data.addedLoaction
  ) {
    const data = await prisma.home.create({
      data: {
        userId: user.id,
        country: "MA",
        listingStatus: "draft",
        contentReviewStatus: "draft",
      },
    });

    await createListingAuditEvent({
      homeId: data.id,
      actorId: user.id,
      eventType: "listing_created",
      message: "Listing draft created.",
      metadata: { listingStatus: "draft" },
    });

    return redirect(`/create/${data.id}/structure`);
  }
}

export async function createCategoryPage(formData: FormData) {
  const categoryName = formData.get("categoryName") as string;
  const homeId = formData.get("homeId") as string;

  const { user } = await requireListingEditor(homeId);

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: {
        id: homeId,
      },
      data: {
        categoryName: categoryName,
        addedCategory: true,
        updatedById: user.id,
      },
    });

    await createListingAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "listing_updated",
      message: "Listing category updated.",
      metadata: { categoryName },
    });
  });

  return redirect(`/create/${homeId}/description`);
}

export async function updateHomeDetails(formData: FormData) {
  const homeId = readString(formData, "homeId");
  if (!homeId) redirect("/");

  const { user } = await requireHomeOwnerOrAdmin(homeId);

  const existingHome = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      listingStatus: true,
      contentReviewStatus: true,
      listingVersion: true,
      title: true,
      partnerSubmittedTitle: true,
      internalName: true,
      description: true,
      partnerSubmittedDescription: true,
      propertyType: true,
      stayType: true,
      city: true,
      neighborhood: true,
      partnerSubmittedNeighborhood: true,
      address: true,
      country: true,
      latitude: true,
      longitude: true,
      guests: true,
      bedrooms: true,
      bathrooms: true,
      guestCount: true,
      bedroomCount: true,
      beds: true,
      bathroomCount: true,
      toilets: true,
      floorNumber: true,
      sizeSqm: true,
      photo: true,
      price: true,
      cleaningFee: true,
      securityDeposit: true,
      minimumNights: true,
      maximumNights: true,
      checkInTime: true,
      checkOutTime: true,
      instantBookAllowed: true,
      platformManagedCommunication: true,
      requiresAdminApproval: true,
      addedLoaction: true,
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          url: true,
          isCover: true,
          sortOrder: true,
        },
      },
      features: {
        select: {
          key: true,
        },
      },
    },
  });

  if (!existingHome) redirect("/");

  const imageFiles = getImageFiles(formData);
  if (existingHome.images.length + imageFiles.length > MAX_HOME_IMAGES) {
    throw new Error("A property gallery can contain a maximum of 10 images.");
  }

  const uploadedImagePaths = await uploadHomeImages(homeId, imageFiles);
  const title = readString(formData, "title");
  const selectedCoverImageId = readString(formData, "coverImageId");
  const selectedCoverImage = existingHome.images.find(
    (image) => image.id === selectedCoverImageId
  );
  const existingCoverImage =
    existingHome.images.find((image) => image.isCover) ?? existingHome.images[0];
  const nextCoverPath =
    selectedCoverImage?.url ??
    (existingHome.images.length === 0 ? uploadedImagePaths[0] : null) ??
    existingCoverImage?.url ??
    existingHome.photo ??
    null;

  const featureKeys = Array.from(
    new Set(
      formData
        .getAll("features")
        .filter((value): value is string => typeof value === "string")
    )
  );
  const selectedFeatures = featureKeys
    .map((key) => getPropertyFeatureByKey(key))
    .filter((feature): feature is NonNullable<typeof feature> =>
      Boolean(feature)
    );

  const guests = readIntFromAny(formData, ["guests", "guest"]);
  const bedrooms = readIntFromAny(formData, ["bedrooms", "room"]);
  const bathrooms = readIntFromAny(formData, ["bathrooms", "bathroom"]);
  const nextPricing = {
    price: readInt(formData, "price"),
    cleaningFee: readInt(formData, "cleaningFee"),
    securityDeposit: readInt(formData, "securityDeposit"),
    minimumNights: readInt(formData, "minimumNights"),
    maximumNights: readInt(formData, "maximumNights"),
  };
  const previousPricing = {
    price: existingHome.price,
    cleaningFee: existingHome.cleaningFee,
    securityDeposit: existingHome.securityDeposit,
    minimumNights: existingHome.minimumNights,
    maximumNights: existingHome.maximumNights,
  };
  const priceChanged = pricingFieldsChanged(previousPricing, nextPricing);
  const existingFeatureKeys = new Set(
    existingHome.features.map((feature) => feature.key)
  );
  const nextFeatureKeys = new Set(featureKeys);
  const featuresChanged = !stringSetsEqual(existingFeatureKeys, nextFeatureKeys);
  const currentCoverImage =
    existingHome.images.find((image) => image.isCover) ?? existingHome.images[0];
  const mediaChanged =
    uploadedImagePaths.length > 0 ||
    Boolean(selectedCoverImageId && selectedCoverImageId !== currentCoverImage?.id);
  const nextDetails = {
    title,
    internalName: readString(formData, "internalName"),
    description: readString(formData, "description"),
    propertyType: readString(formData, "propertyType"),
    stayType: readString(formData, "stayType"),
    city: readString(formData, "city"),
    neighborhood: readString(formData, "neighborhood"),
    address: readString(formData, "address"),
    country: readString(formData, "country") ?? "MA",
    latitude: readFloat(formData, "latitude"),
    longitude: readFloat(formData, "longitude"),
    guests: guests === null ? null : String(guests),
    bedrooms: bedrooms === null ? null : String(bedrooms),
    beds: readInt(formData, "beds"),
    bathrooms: bathrooms === null ? null : String(bathrooms),
    toilets: readInt(formData, "toilets"),
    floorNumber: readInt(formData, "floorNumber"),
    sizeSqm: readInt(formData, "sizeSqm"),
    guestCount: guests,
    bedroomCount: bedrooms,
    bathroomCount: bathrooms,
    checkInTime: readString(formData, "checkInTime"),
    checkOutTime: readString(formData, "checkOutTime"),
    instantBookAllowed: readBoolean(formData, "instantBookAllowed", false),
    platformManagedCommunication: readBoolean(
      formData,
      "platformManagedCommunication",
      true
    ),
    requiresAdminApproval: readBoolean(formData, "requiresAdminApproval", true),
  };
  const nonPriceChanged =
    valuesChanged(existingHome.title, nextDetails.title) ||
    valuesChanged(existingHome.internalName, nextDetails.internalName) ||
    valuesChanged(existingHome.description, nextDetails.description) ||
    valuesChanged(existingHome.propertyType, nextDetails.propertyType) ||
    valuesChanged(existingHome.stayType, nextDetails.stayType) ||
    valuesChanged(existingHome.city, nextDetails.city) ||
    valuesChanged(existingHome.neighborhood, nextDetails.neighborhood) ||
    valuesChanged(existingHome.address, nextDetails.address) ||
    valuesChanged(existingHome.country, nextDetails.country) ||
    valuesChanged(existingHome.latitude, nextDetails.latitude) ||
    valuesChanged(existingHome.longitude, nextDetails.longitude) ||
    valuesChanged(existingHome.guests, nextDetails.guests) ||
    valuesChanged(existingHome.bedrooms, nextDetails.bedrooms) ||
    valuesChanged(existingHome.beds, nextDetails.beds) ||
    valuesChanged(existingHome.bathrooms, nextDetails.bathrooms) ||
    valuesChanged(existingHome.toilets, nextDetails.toilets) ||
    valuesChanged(existingHome.floorNumber, nextDetails.floorNumber) ||
    valuesChanged(existingHome.sizeSqm, nextDetails.sizeSqm) ||
    valuesChanged(existingHome.guestCount, nextDetails.guestCount) ||
    valuesChanged(existingHome.bedroomCount, nextDetails.bedroomCount) ||
    valuesChanged(existingHome.bathroomCount, nextDetails.bathroomCount) ||
    valuesChanged(existingHome.checkInTime, nextDetails.checkInTime) ||
    valuesChanged(existingHome.checkOutTime, nextDetails.checkOutTime) ||
    valuesChanged(existingHome.instantBookAllowed, nextDetails.instantBookAllowed) ||
    valuesChanged(
      existingHome.platformManagedCommunication,
      nextDetails.platformManagedCommunication
    ) ||
    valuesChanged(
      existingHome.requiresAdminApproval,
      nextDetails.requiresAdminApproval
    ) ||
    featuresChanged ||
    mediaChanged;
  const translatableContentChanged =
    valuesChanged(existingHome.title, nextDetails.title) ||
    valuesChanged(existingHome.description, nextDetails.description) ||
    valuesChanged(existingHome.neighborhood, nextDetails.neighborhood);
  const nextListingStatus = existingHome.addedLoaction
    ? existingHome.listingStatus
    : "draft";
  const nextContentReviewStatus =
    existingHome.contentReviewStatus === "approved" && translatableContentChanged
      ? "draft"
      : existingHome.contentReviewStatus;

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: {
        id: homeId,
      },
      data: {
        ...nextDetails,
        partnerSubmittedTitle: nextDetails.title,
        partnerSubmittedDescription: nextDetails.description,
        partnerSubmittedNeighborhood: nextDetails.neighborhood,
        ...nextPricing,
        photo: nextCoverPath,
        addedDescription: true,
        listingStatus: nextListingStatus,
        contentReviewStatus: nextContentReviewStatus,
        ...(translatableContentChanged
          ? {
              contentNeedsChangesReason: null,
              contentRejectionReason: null,
            }
          : {}),
        updatedById: user.id,
        ...(priceChanged
          ? {
              listingVersion: { increment: 1 },
              lastPriceChangedAt: new Date(),
            }
          : {}),
      },
    });

    if (uploadedImagePaths.length > 0) {
      await tx.homeImage.createMany({
        data: uploadedImagePaths.map((url, index) => ({
          homeId,
          url,
          altText: title ?? "Property photo",
          sortOrder: existingHome.images.length + index,
          isCover:
            existingHome.images.length === 0 &&
            index === 0 &&
            !selectedCoverImageId,
        })),
      });
    }

    if (selectedCoverImageId) {
      await tx.homeImage.updateMany({
        where: { homeId },
        data: { isCover: false },
      });
      await tx.homeImage.updateMany({
        where: { homeId, id: selectedCoverImageId },
        data: { isCover: true },
      });
    }

    await tx.homeFeature.deleteMany({
      where: { homeId },
    });

    if (selectedFeatures.length > 0) {
      await tx.homeFeature.createMany({
        data: selectedFeatures.map((feature) => ({
          homeId,
          group: feature.group,
          key: feature.key,
          label: feature.label,
        })),
      });
    }

    await createListingPriceHistoryIfChanged({
      tx,
      homeId,
      changedById: user.id,
      previous: previousPricing,
      next: nextPricing,
      reason: readString(formData, "changeReason"),
    });

    if (priceChanged) {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "price_changed",
        message: "Listing financial terms changed.",
        metadata: {
          previous: previousPricing,
          next: nextPricing,
          previousListingVersion: existingHome.listingVersion,
          nextListingVersion: existingHome.listingVersion + 1,
        },
      });
    }

    if (nonPriceChanged) {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "listing_updated",
        message: "Listing details updated.",
        metadata: {
          mediaChanged,
          featuresChanged,
          listingStatus: nextListingStatus,
        },
      });
    }

    if (translatableContentChanged) {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "partner_proposed_changes_saved",
        message: "Partner proposed listing content saved.",
        metadata: {
          previousContentReviewStatus: existingHome.contentReviewStatus,
          nextContentReviewStatus,
        },
      });
    }

    if (mediaChanged) {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "media_updated",
        message: "Listing media updated.",
        metadata: {
          uploadedImageCount: uploadedImagePaths.length,
          selectedCoverImageId,
        },
      });
    }

    if (featuresChanged) {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "features_updated",
        message: "Listing features updated.",
        metadata: {
          previousFeatureCount: existingFeatureKeys.size,
          nextFeatureCount: nextFeatureKeys.size,
        },
      });
    }
  });

  revalidateListingPaths(homeId);

  if (existingHome.addedLoaction) {
    return redirect("/my-homes?notice=listing-updated");
  }

  return redirect(`/create/${homeId}/address`);
}

export async function CreateDescription(formData: FormData) {
  return updateHomeDetails(formData);
}

export async function createLocation(formData: FormData) {
  const homeId = formData.get("homeId") as string;
  const countryValue = formData.get("countryValue") as string;

  const { user, home } = await requireListingEditor(homeId);

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: {
        id: homeId,
      },
      data: {
        addedLoaction: true,
        ...(countryValue ? { country: countryValue } : {}),
        listingStatus: "pending_review",
        contentReviewStatus: "pending_review",
        submittedForReviewAt: new Date(),
        updatedById: user.id,
        statusChangedAt: new Date(),
        statusChangedById: user.id,
      },
    });

    if (home.listingStatus !== "pending_review") {
      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "listing_status_changed",
        message: "Listing submitted for review.",
        metadata: {
          previousStatus: home.listingStatus,
          nextStatus: "pending_review",
          previousContentReviewStatus: home.contentReviewStatus,
          nextContentReviewStatus: "pending_review",
        },
      });
    }
  });

  revalidateListingPaths(homeId);

  return redirect("/");
}

export async function archiveHome(homeId: string) {
  const { user } = await requireHomeOwnerOrAdmin(homeId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        listingStatus: "archived",
        contentReviewStatus: "archived",
        archivedAt: now,
        statusChangedAt: now,
        statusChangedById: user.id,
        updatedById: user.id,
      },
    });

    await createListingAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "listing_archived",
      message: "Listing archived.",
    });
  });

  revalidateListingPaths(homeId);
  redirect("/my-homes?notice=listing-archived");
}

export async function restoreHome(homeId: string) {
  const { user, home } = await requireHomeOwnerOrAdmin(homeId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        listingStatus: "pending_review",
        contentReviewStatus: "pending_review",
        archivedAt: null,
        deletionBlockedReason: null,
        statusChangedAt: now,
        statusChangedById: user.id,
        updatedById: user.id,
      },
    });

    await createListingAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "listing_restored",
      message: "Listing restored to pending review.",
      metadata: {
          previousStatus: home.listingStatus,
          nextStatus: "pending_review",
          previousContentReviewStatus: home.contentReviewStatus,
          nextContentReviewStatus: "pending_review",
        },
    });
  });

  revalidateListingPaths(homeId);
  redirect("/my-homes?notice=listing-restored");
}

function buildDeletionBlockedReason(counts: {
  reservations: number;
  reviews: number;
  favorites: number;
}) {
  const reasons = [];

  if (counts.reservations > 0) reasons.push("booking history");
  if (counts.reviews > 0) reasons.push("review history");
  if (counts.favorites > 0) reasons.push("saved guest favorites");

  return `Permanent deletion blocked because this listing has ${reasons.join(
    ", "
  )}. It was archived instead.`;
}

export async function deleteHome(homeId: string, formData: FormData) {
  const confirmed = formData.get("deleteConfirmed") === "true";
  if (!confirmed) redirect("/my-homes?notice=delete-confirmation-required");

  const { user, home } = await requireHomeOwnerOrAdmin(homeId);
  const currentHome = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      title: true,
      userId: true,
      listingStatus: true,
      _count: {
        select: {
          Reservation: true,
          reviews: true,
          Favorite: true,
        },
      },
    },
  });

  if (!currentHome) redirect("/");

  const dependencyCounts = {
    reservations: currentHome._count.Reservation,
    reviews: currentHome._count.reviews,
    favorites: currentHome._count.Favorite,
  };
  const hasDependentHistory =
    dependencyCounts.reservations > 0 ||
    dependencyCounts.reviews > 0 ||
    dependencyCounts.favorites > 0;
  const now = new Date();

  if (hasDependentHistory) {
    const deletionBlockedReason = buildDeletionBlockedReason(dependencyCounts);

    await prisma.$transaction(async (tx) => {
      await tx.home.update({
        where: { id: homeId },
        data: {
          listingStatus: "archived",
          contentReviewStatus: "archived",
          archivedAt: now,
          deletionBlockedReason,
          statusChangedAt: now,
          statusChangedById: user.id,
          updatedById: user.id,
        },
      });

      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "listing_delete_blocked",
        message:
          "This listing has booking/review history and was archived instead of permanently deleted.",
        metadata: dependencyCounts,
      });
    });

    revalidateListingPaths(homeId);
    redirect("/my-homes?notice=listing-delete-blocked");
  }

  const actorIsAdmin = isAdminRole(user.role);
  const adminCanDelete =
    actorIsAdmin &&
    (currentHome.listingStatus === "draft" ||
      currentHome.listingStatus === "archived");
  const ownerCanDeleteOwnDraft =
    currentHome.userId === user.id && currentHome.listingStatus === "draft";

  if (!adminCanDelete && !ownerCanDeleteOwnDraft) {
    const deletionBlockedReason =
      "Permanent deletion is allowed only for dependency-free draft listings, or dependency-free draft/archived listings by admins.";

    await prisma.$transaction(async (tx) => {
      await tx.home.update({
        where: { id: homeId },
        data: {
          listingStatus: "archived",
          contentReviewStatus: "archived",
          archivedAt: now,
          deletionBlockedReason,
          statusChangedAt: now,
          statusChangedById: user.id,
          updatedById: user.id,
        },
      });

      await createListingAuditEvent({
        tx,
        homeId,
        actorId: user.id,
        eventType: "listing_delete_blocked",
        message: deletionBlockedReason,
        metadata: {
          listingStatus: currentHome.listingStatus,
          actorRole: user.role,
          ownerId: home.userId,
        },
      });
    });

    revalidateListingPaths(homeId);
    redirect("/my-homes?notice=listing-delete-blocked");
  }

  await prisma.$transaction(async (tx) => {
    await createListingAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "listing_deleted",
      message: "Listing permanently deleted.",
      metadata: {
        deletedHomeId: homeId,
        title: currentHome.title,
        previousStatus: currentHome.listingStatus,
      },
    });

    await tx.home.delete({
      where: { id: homeId },
    });
  });

  revalidateListingPaths(homeId);
  redirect("/my-homes?notice=listing-deleted");
}

export async function addToFavorite(formData: FormData) {
  const homeId = formData.get("homeId") as string;
  const userId = formData.get("userId") as string;
  const pathName = formData.get("pathName") as string;

  const data = await prisma.favorite.create({
    data: {
      homeId: homeId,
      userId: userId,
    },
  });

  revalidatePath(pathName);
}

export async function DeleteFromFavorite(formData: FormData) {
  const favoriteId = formData.get("favoriteId") as string;
  const pathName = formData.get("pathName") as string;
  const userId = formData.get("userId") as string;

  const data = await prisma.favorite.delete({
    where: {
      id: favoriteId,
      userId: userId,
    },
  });

  revalidatePath(pathName);
}

export async function createReservation(formData: FormData) {
  const user = await requireUser();
  const homeId = readString(formData, "homeId");
  const startDateValue = readString(formData, "startDate");
  const endDateValue = readString(formData, "endDate");

  if (!homeId || !startDateValue || !endDateValue) redirect("/");

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);
  const totalNightsSnapshot = getReservationNightCount(startDate, endDate);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    totalNightsSnapshot <= 0
  ) {
    redirect(`/home/${homeId}?reservation=invalid-dates`);
  }

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      title: true,
      city: true,
      propertyType: true,
      listingStatus: true,
      listingVersion: true,
      price: true,
      cleaningFee: true,
      securityDeposit: true,
      minimumNights: true,
      maximumNights: true,
    },
  });

  if (!home || home.listingStatus !== "approved") {
    redirect("/");
  }

  if (
    (home.minimumNights && totalNightsSnapshot < home.minimumNights) ||
    (home.maximumNights && totalNightsSnapshot > home.maximumNights)
  ) {
    redirect(`/home/${homeId}?reservation=outside-night-policy`);
  }

  const overlappingReservation = await prisma.reservation.findFirst({
    where: {
      homeId,
      bookingStatus: { in: ACTIVE_BOOKING_STATUSES },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
    select: { id: true },
  });

  if (overlappingReservation) {
    redirect(`/home/${homeId}?reservation=unavailable`);
  }

  const nightlyPriceSnapshot = home.price;
  const subtotalSnapshot =
    nightlyPriceSnapshot === null
      ? null
      : totalNightsSnapshot * nightlyPriceSnapshot;
  const totalSnapshot =
    subtotalSnapshot === null
      ? null
      : subtotalSnapshot +
        (home.cleaningFee ?? 0) +
        (home.securityDeposit ?? 0);
  const currencySettings = await getCurrencySettings();

  await prisma.reservation.create({
    data: {
      userId: user.id,
      homeId,
      endDate,
      startDate,
      nightlyPriceSnapshot,
      cleaningFeeSnapshot: home.cleaningFee,
      securityDepositSnapshot: home.securityDeposit,
      totalNightsSnapshot,
      subtotalSnapshot,
      totalSnapshot,
      currencySnapshot: currencySettings.baseCurrency,
      bookingStatus: "reserved",
      listingTitleSnapshot: home.title,
      listingCitySnapshot: home.city,
      listingPropertyTypeSnapshot: home.propertyType,
      listingVersionSnapshot: home.listingVersion,
      priceLockedAt: new Date(),
    },
  });

  revalidatePath("/reservations");
  revalidateListingPaths(homeId);

  return redirect("/reservations");
}
