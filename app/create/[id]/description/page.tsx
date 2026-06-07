import { CreateDescription } from "@/app/actions";
import { PropertyImage } from "@/app/components/PropertyImage";
import { CreatioBottomBar } from "@/app/components/CreationBottomBar";
import prisma from "@/app/lib/db";
import {
  getPropertyFeatureGroupDescription,
  getPropertyFeatureGroupTitle,
  getPropertyFeatureLabel,
  getPropertyTypeLabel,
  getStayTypeLabel,
  PROPERTY_FEATURE_GROUPS,
  PROPERTY_TYPES,
  STAY_TYPES,
} from "@/app/lib/propertyFeatures";
import { resolveHomeImageUrl } from "@/app/lib/propertyImages";
import { requireListingEditor } from "@/app/lib/auth";
import { getTranslator } from "@/app/lib/i18n";
import { getStatusLabel } from "@/app/lib/statusLabels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

const MAX_HOME_IMAGES = 10;

function numberValue(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return undefined;
  return Number(value);
}

function textValue(value?: string | null) {
  return value ?? undefined;
}

function tTemplate(
  t: (namespace: string, key: string, fallback: string) => string,
  namespace: string,
  key: string,
  fallback: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    t(namespace, key, fallback)
  );
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function NativeSelect({
  name,
  defaultValue,
  options,
  placeholder,
}: {
  name: string;
  defaultValue?: string | null;
  options: readonly { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

async function getHome(homeId: string) {
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      title: true,
      partnerSubmittedTitle: true,
      approvedTitle: true,
      internalName: true,
      description: true,
      partnerSubmittedDescription: true,
      approvedDescription: true,
      propertyType: true,
      stayType: true,
      city: true,
      neighborhood: true,
      partnerSubmittedNeighborhood: true,
      approvedNeighborhood: true,
      address: true,
      country: true,
      latitude: true,
      longitude: true,
      guests: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
      toilets: true,
      floorNumber: true,
      sizeSqm: true,
      guestCount: true,
      bedroomCount: true,
      bathroomCount: true,
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
      listingStatus: true,
      contentReviewStatus: true,
      contentNeedsChangesReason: true,
      contentRejectionReason: true,
      submittedForReviewAt: true,
      contentReviewedAt: true,
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          url: true,
          altText: true,
          sortOrder: true,
          isCover: true,
        },
      },
      features: {
        select: {
          key: true,
        },
      },
    },
  });

  if (!home) redirect("/");

  return home;
}

export default async function DescriptionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireListingEditor(params.id);
  const [home, translator] = await Promise.all([
    getHome(params.id),
    getTranslator(),
  ]);
  const t = translator.t;
  const selectedFeatures = new Set(home.features.map((feature) => feature.key));
  const imageCount = home.images.length;
  const propertyTypeOptions = PROPERTY_TYPES.map((option) => ({
    ...option,
    label: getPropertyTypeLabel(option.value, t) ?? option.label,
  }));
  const stayTypeOptions = STAY_TYPES.map((option) => ({
    ...option,
    label: getStayTypeLabel(option.value, t) ?? option.label,
  }));

  return (
    <form action={CreateDescription} encType="multipart/form-data">
      <input type="hidden" name="homeId" value={params.id} />

      <div className="mx-auto mb-40 flex w-full max-w-6xl flex-col gap-8 px-5 lg:px-10">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {t(
              "createListing",
              "partner_proposed_content",
              "Partner proposed content"
            )}
          </p>
          <div className="max-w-3xl space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t(
                "createListing",
                "proposal_title",
                "Prepare a listing proposal for Kantara review"
              )}
            </h1>
            <p className="text-muted-foreground">
              {t(
                "createListing",
                "proposal_copy",
                "Your proposed public title, description, and neighborhood are reviewed by Kantara before they become public. Approved public content remains live until an admin approves a revision."
              )}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("createListing", "review_status", "Review status")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">
                {t("createListing", "content_review", "Content review")}
              </p>
              <p className="mt-1 font-medium">
                {getStatusLabel(home.contentReviewStatus, t)}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">
                {t("createListing", "listing_status", "Listing status")}
              </p>
              <p className="mt-1 font-medium">
                {getStatusLabel(home.listingStatus, t)}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">
                {t("createListing", "last_reviewed", "Last reviewed")}
              </p>
              <p className="mt-1 font-medium">
                {home.contentReviewedAt
                  ? home.contentReviewedAt.toLocaleDateString("en-US")
                  : t("createListing", "not_reviewed", "Not reviewed")}
              </p>
            </div>
            {home.contentNeedsChangesReason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-3">
                <p className="font-medium">
                  {t(
                    "createListing",
                    "kantara_requested_changes",
                    "Kantara requested changes"
                  )}
                </p>
                <p className="mt-1">{home.contentNeedsChangesReason}</p>
              </div>
            ) : null}
            {home.contentRejectionReason ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-950 md:col-span-3">
                <p className="font-medium">
                  {t("createListing", "review_decision", "Review decision")}
                </p>
                <p className="mt-1">{home.contentRejectionReason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {home.approvedTitle || home.approvedDescription ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {t(
                  "createListing",
                  "current_approved_public_version",
                  "Current approved public version"
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">
                  {t("createListing", "approved_title", "Approved title")}
                </p>
                <p className="mt-1 font-medium">
                  {home.approvedTitle ??
                    t("createListing", "not_approved", "Not approved")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  {t(
                    "createListing",
                    "approved_description",
                    "Approved description"
                  )}
                </p>
                <p className="mt-1 whitespace-pre-line">
                  {home.approvedDescription ??
                    t("createListing", "not_approved", "Not approved")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  {t(
                    "createListing",
                    "approved_neighborhood",
                    "Approved neighborhood"
                  )}
                </p>
                <p className="mt-1 font-medium">
                  {home.approvedNeighborhood ??
                    t("createListing", "not_approved", "Not approved")}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("createListing", "listing_identity", "Listing identity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field
              label={t(
                "createListing",
                "your_proposed_title",
                "Your proposed title"
              )}
              helper={t(
                "createListing",
                "proposed_title_helper",
                "This will be reviewed by Kantara before becoming public."
              )}
            >
              <Input
                name="title"
                required
                defaultValue={textValue(home.partnerSubmittedTitle ?? home.title)}
                placeholder={t(
                  "createListing",
                  "placeholder.title",
                  "Elegant riad suite near Jemaa el-Fnaa"
                )}
              />
            </Field>
            <Field
              label={t("createListing", "internal_name", "Internal name")}
              helper={t(
                "createListing",
                "internal_name_helper",
                "Visible to operations teams, not guests."
              )}
            >
              <Input
                name="internalName"
                defaultValue={textValue(home.internalName)}
                placeholder={t(
                  "createListing",
                  "placeholder.internalName",
                  "Marrakech Riad A - Suite 2"
                )}
              />
            </Field>
            <div className="md:col-span-2">
              <Field
                label={t(
                  "createListing",
                  "your_proposed_description",
                  "Your proposed description"
                )}
                helper={t(
                  "createListing",
                  "proposed_description_helper",
                  "This content will be reviewed by Kantara before becoming public."
                )}
              >
                <Textarea
                  name="description"
                  required
                  defaultValue={textValue(
                    home.partnerSubmittedDescription ?? home.description
                  )}
                  placeholder={t(
                    "createListing",
                    "placeholder.description",
                    "Describe the space, the guest experience, access, nearby landmarks, and what makes this stay suitable for Morocco travelers."
                  )}
                  className="min-h-40"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t(
                "createListing",
                "property_classification",
                "Property classification"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Field label={t("createListing", "property_type", "Property type")}>
              <NativeSelect
                name="propertyType"
                defaultValue={home.propertyType}
                placeholder={t(
                  "createListing",
                  "select_property_type",
                  "Select property type"
                )}
                options={propertyTypeOptions}
              />
            </Field>
            <Field label={t("createListing", "stay_type", "Stay type")}>
              <NativeSelect
                name="stayType"
                defaultValue={home.stayType}
                placeholder={t(
                  "createListing",
                  "select_stay_type",
                  "Select stay type"
                )}
                options={stayTypeOptions}
              />
            </Field>
            <Field label={t("createListing", "country", "Country")}>
              <Input name="country" defaultValue={home.country ?? "MA"} />
            </Field>
            <Field label={t("createListing", "city", "City")}>
              <Input
                name="city"
                defaultValue={textValue(home.city)}
                placeholder={t("createListing", "placeholder.city", "Marrakech")}
              />
            </Field>
            <Field
              label={t(
                "createListing",
                "your_proposed_neighborhood",
                "Your proposed neighborhood"
              )}
              helper={t(
                "createListing",
                "proposed_neighborhood_helper",
                "Kantara may normalize this for public guest display."
              )}
            >
              <Input
                name="neighborhood"
                defaultValue={textValue(
                  home.partnerSubmittedNeighborhood ?? home.neighborhood
                )}
                placeholder={t(
                  "createListing",
                  "placeholder.neighborhood",
                  "Medina, Gueliz, Agdal"
                )}
              />
            </Field>
            <Field label={t("createListing", "address", "Address")}>
              <Input
                name="address"
                defaultValue={textValue(home.address)}
                placeholder={t(
                  "createListing",
                  "placeholder.address",
                  "Street, building, residence, or landmark"
                )}
              />
            </Field>
            <Field label={t("createListing", "latitude", "Latitude")}>
              <Input
                name="latitude"
                type="number"
                step="any"
                defaultValue={numberValue(home.latitude)}
                placeholder="31.6295"
              />
            </Field>
            <Field label={t("createListing", "longitude", "Longitude")}>
              <Input
                name="longitude"
                type="number"
                step="any"
                defaultValue={numberValue(home.longitude)}
                placeholder="-7.9811"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("createListing", "capacity", "Capacity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Field label={t("common", "guests", "Guests")}>
              <Input
                name="guests"
                type="number"
                min={0}
                defaultValue={numberValue(home.guestCount ?? home.guests)}
              />
            </Field>
            <Field label={t("common", "bedrooms", "Bedrooms")}>
              <Input
                name="bedrooms"
                type="number"
                min={0}
                defaultValue={numberValue(home.bedroomCount ?? home.bedrooms)}
              />
            </Field>
            <Field label={t("createListing", "beds", "Beds")}>
              <Input
                name="beds"
                type="number"
                min={0}
                defaultValue={numberValue(home.beds)}
              />
            </Field>
            <Field label={t("common", "bathrooms", "Bathrooms")}>
              <Input
                name="bathrooms"
                type="number"
                min={0}
                defaultValue={numberValue(home.bathroomCount ?? home.bathrooms)}
              />
            </Field>
            <Field label={t("createListing", "toilets", "Toilets")}>
              <Input
                name="toilets"
                type="number"
                min={0}
                defaultValue={numberValue(home.toilets)}
              />
            </Field>
            <Field label={t("createListing", "floor_number", "Floor number")}>
              <Input
                name="floorNumber"
                type="number"
                defaultValue={numberValue(home.floorNumber)}
              />
            </Field>
            <Field label={t("createListing", "size_sqm", "Size in sqm")}>
              <Input
                name="sizeSqm"
                type="number"
                min={0}
                defaultValue={numberValue(home.sizeSqm)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("createListing", "pricing", "Pricing")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            <Field label={t("createListing", "price_per_night", "Price per night")}>
              <Input
                name="price"
                type="number"
                min={0}
                required
                defaultValue={numberValue(home.price)}
                placeholder="1200"
              />
            </Field>
            <Field label={t("listing", "cleaning_fee", "Cleaning fee")}>
              <Input
                name="cleaningFee"
                type="number"
                min={0}
                defaultValue={numberValue(home.cleaningFee)}
              />
            </Field>
            <Field label={t("listing", "security_deposit", "Security deposit")}>
              <Input
                name="securityDeposit"
                type="number"
                min={0}
                defaultValue={numberValue(home.securityDeposit)}
              />
            </Field>
            <Field label={t("createListing", "minimum_nights", "Minimum nights")}>
              <Input
                name="minimumNights"
                type="number"
                min={1}
                defaultValue={numberValue(home.minimumNights)}
              />
            </Field>
            <Field label={t("createListing", "maximum_nights", "Maximum nights")}>
              <Input
                name="maximumNights"
                type="number"
                min={1}
                defaultValue={numberValue(home.maximumNights)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-xl">
                {t("createListing", "media_gallery", "Media gallery")}
              </CardTitle>
              <div className="rounded-md bg-muted px-3 py-1 text-sm text-muted-foreground">
                {tTemplate(
                  t,
                  "createListing",
                  "images_saved",
                  "{count} of {max} images saved",
                  { count: imageCount, max: MAX_HOME_IMAGES }
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {home.images.length > 0 ? (
                home.images.map((image, index) => {
                  const imageUrl = resolveHomeImageUrl(image.url);
                  const isDefaultCover =
                    image.isCover || (!home.images.some((item) => item.isCover) && index === 0);

                  return (
                    <label
                      key={image.id}
                      className="group cursor-pointer overflow-hidden rounded-md border bg-background"
                    >
                      <div className="relative aspect-[4/3]">
                        <PropertyImage
                          src={imageUrl}
                          alt={
                            image.altText ??
                            t(
                              "createListing",
                              "property_gallery_image",
                              "Property gallery image"
                            )
                          }
                          fill
                          className="object-cover transition group-hover:scale-[1.02]"
                          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 50vw, 100vw"
                        />
                      </div>
                      <div className="flex items-center gap-2 p-3 text-sm">
                        <input
                          type="radio"
                          name="coverImageId"
                          value={image.id}
                          defaultChecked={isDefaultCover}
                          className="h-4 w-4 accent-primary"
                        />
                        <span>
                          {isDefaultCover
                            ? t("createListing", "cover_image", "Cover image")
                            : t("createListing", "use_as_cover", "Use as cover")}
                        </span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-6 text-center text-muted-foreground sm:col-span-2 lg:col-span-5">
                  <ImagePlus className="mb-3 h-8 w-8" />
                  <p className="text-sm font-medium text-foreground">
                    {t(
                      "createListing",
                      "no_gallery_images_title",
                      "No gallery images yet"
                    )}
                  </p>
                  <p className="mt-1 max-w-md text-sm">
                    {t(
                      "createListing",
                      "no_gallery_images_copy",
                      "Upload clear photos for rooms, exterior, view, bathroom, kitchen, and entrance. The first image becomes the cover."
                    )}
                  </p>
                </div>
              )}
            </div>

            <Field
              label={t(
                "createListing",
                "upload_property_images",
                "Upload property images"
              )}
              helper={t(
                "createListing",
                "upload_property_images_helper",
                "Add up to 10 images total. Existing images remain saved; new uploads are appended."
              )}
            >
              <Input
                name="images"
                type="file"
                accept="image/*"
                multiple
                disabled={imageCount >= MAX_HOME_IMAGES}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("createListing", "amenities_features", "Amenities and features")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {PROPERTY_FEATURE_GROUPS.map((group) => (
              <div key={group.group} className="rounded-md border p-4">
                <div className="mb-4">
                  <h3 className="font-medium">
                    {getPropertyFeatureGroupTitle(group.group, group.title, t)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {getPropertyFeatureGroupDescription(
                      group.group,
                      group.description,
                      t
                    )}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.features.map((feature) => (
                    <label
                      key={feature.key}
                      className="flex min-h-10 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="features"
                        value={feature.key}
                        defaultChecked={selectedFeatures.has(feature.key)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span>
                        {getPropertyFeatureLabel(feature.key, feature.label, t)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t(
                "createListing",
                "house_rules_policy",
                "House rules and platform policy"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field label={t("createListing", "check_in_time", "Check-in time")}>
              <Input
                name="checkInTime"
                type="time"
                defaultValue={textValue(home.checkInTime)}
              />
            </Field>
            <Field label={t("createListing", "check_out_time", "Check-out time")}>
              <Input
                name="checkOutTime"
                type="time"
                defaultValue={textValue(home.checkOutTime)}
              />
            </Field>
            <div className="md:col-span-2 grid gap-3 lg:grid-cols-3">
              <label className="flex items-start gap-3 rounded-md border p-4">
                <input type="hidden" name="platformManagedCommunication" value="false" />
                <input
                  type="checkbox"
                  name="platformManagedCommunication"
                  value="true"
                  defaultChecked={home.platformManagedCommunication ?? true}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium">
                    {t(
                      "createListing",
                      "platform_managed_communication",
                      "Platform-managed communication"
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(
                      "createListing",
                      "platform_managed_communication_helper",
                      "Guest contact remains managed through marketplace operations."
                    )}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-4">
                <input type="hidden" name="instantBookAllowed" value="false" />
                <input
                  type="checkbox"
                  name="instantBookAllowed"
                  value="true"
                  defaultChecked={home.instantBookAllowed}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium">
                    {t(
                      "createListing",
                      "instant_book_allowed",
                      "Instant book allowed"
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(
                      "createListing",
                      "instant_book_allowed_helper",
                      "Stored for future booking rules. It remains off by default."
                    )}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-4">
                <input type="hidden" name="requiresAdminApproval" value="false" />
                <input
                  type="checkbox"
                  name="requiresAdminApproval"
                  value="true"
                  defaultChecked={home.requiresAdminApproval ?? true}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium">
                    {t(
                      "createListing",
                      "requires_admin_approval",
                      "Requires admin approval"
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(
                      "createListing",
                      "requires_admin_approval_helper",
                      "New and edited listings stay reviewable before publication."
                    )}
                  </span>
                </span>
              </label>
            </div>
            <div className="md:col-span-2 flex items-start gap-3 rounded-md bg-muted p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-primary" />
              <p>
                {home.addedLoaction
                  ? t(
                      "createListing",
                      "save_draft_review",
                      "Save draft stores proposed changes for Kantara review. Existing approved public content and reservation snapshots remain unchanged."
                    )
                  : t(
                      "createListing",
                      "draft_location_pending",
                      "Saving this page keeps the listing in draft. Completing the location step moves it to pending review for marketplace approval."
                    )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreatioBottomBar
        cancelLabel={t("common", "cancel", "Cancel")}
        pendingLabel={t("common", "please_wait", "Please wait")}
        submitLabel={
          home.addedLoaction
            ? t("createListing", "save_draft", "Save draft")
            : t("search", "next", "Next")
        }
      />
    </form>
  );
}
