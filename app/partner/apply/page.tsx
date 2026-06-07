import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isAdminRole, requireUser } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  APPLICANT_TYPES,
  MOROCCO_CITIES,
  PREFERRED_LANGUAGES,
  PROPERTY_TYPE_OPTIONS,
  calculatePartnerReadinessScore,
  formatPartnerStatus,
  getMinimumSubmissionIssues,
  getReadinessGaps,
  isActivePartnerApplicationStatus,
  splitCsv,
} from "@/app/lib/partner";
import { upsertPartnerApplication } from "@/app/partner/actions";

type SearchParams = {
  error?: string;
  saved?: string;
  submitted?: string;
};

async function getLatestPartnerApplication(userId: string) {
  noStore();

  return prisma.partnerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

type PartnerApplicationRecord = NonNullable<
  Awaited<ReturnType<typeof getLatestPartnerApplication>>
>;

function getStatusTone(status?: string | null) {
  const tones: Record<string, string> = {
    draft: "border-slate-200 bg-slate-50 text-slate-800",
    submitted: "border-blue-200 bg-blue-50 text-blue-900",
    under_review: "border-amber-200 bg-amber-50 text-amber-900",
    needs_information: "border-orange-200 bg-orange-50 text-orange-900",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rejected: "border-red-200 bg-red-50 text-red-900",
    suspended: "border-zinc-300 bg-zinc-100 text-zinc-900",
  };

  return tones[status ?? ""] ?? "border-slate-200 bg-slate-50 text-slate-800";
}

function getErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    "missing-required-fields":
      "Complete the required profile, city, property count, contact, and agreement fields before submitting.",
    "active-application":
      "You already have an application submitted or under review. Admin review must finish before another submission.",
    "suspended-application":
      "This partner application is suspended. Contact marketplace operations before resubmitting.",
  };

  return error ? messages[error] ?? "The application could not be updated." : null;
}

function TextField({
  name,
  label,
  helper,
  value,
  type = "text",
}: {
  name: string;
  label: string;
  helper?: string;
  value?: string | number | null;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={value ?? ""} />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function TextAreaField({
  name,
  label,
  helper,
  value,
}: {
  name: string;
  label: string;
  helper?: string;
  value?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={value ?? ""} rows={4} />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function SelectField({
  name,
  label,
  helper,
  value,
  placeholder,
  options,
}: {
  name: string;
  label: string;
  helper?: string;
  value?: string | null;
  placeholder: string;
  options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function CitySelect({
  value,
  name = "city",
  label = "Primary operating city",
}: {
  value?: string | null;
  name?: string;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <option value="">Select city</option>
        {MOROCCO_CITIES.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Used for routing partner operations and admin review.
      </p>
    </div>
  );
}

function CheckboxItem({
  name,
  label,
  helper,
  value,
  checked,
}: {
  name: string;
  label: string;
  helper?: string;
  value?: string;
  checked?: boolean;
}) {
  return (
    <label className="flex gap-3 rounded-md border bg-background p-3 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="mt-0.5 h-4 w-4 accent-rose-600"
      />
      <span>
        <span className="font-medium">{label}</span>
        {helper ? (
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            {helper}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ReadinessPanel({
  application,
}: {
  application: PartnerApplicationRecord | null;
}) {
  const score = application ? calculatePartnerReadinessScore(application) : 0;
  const gaps = application ? getReadinessGaps(application) : [];
  const minimumIssues = application ? getMinimumSubmissionIssues(application) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Partner readiness</CardTitle>
        <CardDescription>
          Readiness is calculated from actual completed onboarding fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-sm text-muted-foreground">Score</p>
            <p className="text-2xl font-semibold">{score}/100</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {application ? (
          <div className="space-y-3">
            {minimumIssues.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Submission requirements</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {minimumIssues.map((issue) => (
                    <li key={issue}>Missing: {issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {gaps.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Readiness gaps</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Core onboarding details are complete enough for admin review.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Start the application to calculate readiness.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPanel({
  application,
}: {
  application: PartnerApplicationRecord | null;
}) {
  if (!application) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Application status</CardTitle>
          <CardDescription>
            No partner application has been started for this account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const score = calculatePartnerReadinessScore(application);

  return (
    <Card className={getStatusTone(application.status)}>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-xl">
              {formatPartnerStatus(application.status)}
            </CardTitle>
            <CardDescription className="mt-2 text-inherit/80">
              Current partner onboarding state for this account.
            </CardDescription>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2 text-right">
            <p className="text-xs text-muted-foreground">Readiness</p>
            <p className="text-lg font-semibold text-foreground">{score}/100</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isActivePartnerApplicationStatus(application.status) ? (
          <p>
            Operations will review partner identity, property authorization,
            capacity, and compliance readiness before listing tools unlock.
          </p>
        ) : null}
        {application.status === "needs_information" &&
        application.needsInformationReason ? (
          <div className="rounded-md border bg-background/80 p-4 text-foreground">
            <p className="font-medium">Admin requested more information</p>
            <p className="mt-2 text-muted-foreground">
              {application.needsInformationReason}
            </p>
          </div>
        ) : null}
        {application.status === "rejected" && application.rejectionReason ? (
          <div className="rounded-md border bg-background/80 p-4 text-foreground">
            <p className="font-medium">Rejection reason</p>
            <p className="mt-2 text-muted-foreground">
              {application.rejectionReason}
            </p>
          </div>
        ) : null}
        {application.status === "suspended" ? (
          <p>
            This partner account is suspended by operations. Listing access
            remains locked until marketplace leadership resolves the case.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PartnerApplicationForm({
  application,
  user,
}: {
  application: PartnerApplicationRecord | null;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}) {
  const selectedOperatingCities = new Set(application?.operatingCities ?? []);
  const selectedPropertyTypes = new Set(splitCsv(application?.propertyTypes));
  const primaryName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <form action={upsertPartnerApplication} className="space-y-6">
      <FormSection
        eyebrow="A"
        title="Applicant profile"
        description="Identify who will be accountable for the partner relationship."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            name="applicantType"
            label="Applicant type"
            placeholder="Select applicant type"
            value={application?.applicantType}
            options={APPLICANT_TYPES}
            helper="Supports owners, agencies, managers, companies, and operators."
          />
          <TextField
            name="legalName"
            label="Legal name"
            value={application?.legalName}
            helper="Individual legal name or registered legal entity."
          />
          <TextField
            name="displayName"
            label="Public or operating name"
            value={application?.displayName}
          />
          <TextField
            name="primaryContactName"
            label="Primary contact name"
            value={application?.primaryContactName ?? primaryName}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="B"
        title="Contact and language"
        description="Set the operational contact channels for onboarding review."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextField name="email" label="Email" type="email" value={application?.email ?? user.email} />
          <TextField name="phone" label="Phone" value={application?.phone} />
          <TextField name="whatsapp" label="WhatsApp" value={application?.whatsapp} />
          <SelectField
            name="preferredLanguage"
            label="Preferred language"
            placeholder="Select language"
            value={application?.preferredLanguage}
            options={PREFERRED_LANGUAGES}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="C"
        title="Business and company identity"
        description="Capture entity, tax, and document references before approval."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            name="companyName"
            label="Company or agency name"
            value={application?.companyName}
          />
          <TextField
            name="companyRegistrationNumber"
            label="Registration number"
            value={application?.companyRegistrationNumber}
          />
          <TextField
            name="taxIdentifier"
            label="Tax identifier"
            value={application?.taxIdentifier}
          />
          <TextField
            name="nationalIdOrPassport"
            label="National ID or passport"
            value={application?.nationalIdOrPassport}
          />
          <TextField
            name="country"
            label="Country"
            value={application?.country ?? "Morocco"}
          />
          <TextField
            name="address"
            label="Business or contact address"
            value={application?.address}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="D"
        title="Morocco operating cities"
        description="Define the Moroccan cities where this partner can operate reliably."
      >
        <div className="space-y-5">
          <CitySelect value={application?.city} />
          <div>
            <p className="text-sm font-medium">Operating cities</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MOROCCO_CITIES.map((city) => (
                <CheckboxItem
                  key={city}
                  name="operatingCities"
                  value={city}
                  label={city}
                  checked={selectedOperatingCities.has(city)}
                />
              ))}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        eyebrow="E"
        title="Property portfolio"
        description="Map the partner’s property supply and authorization posture."
      >
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              name="estimatedPropertyCount"
              label="Estimated property count"
              type="number"
              value={application?.estimatedPropertyCount}
              helper="Required before submission."
            />
            <TextField
              name="currentPortfolioSize"
              label="Current managed portfolio size"
              type="number"
              value={application?.currentPortfolioSize}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Property types</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROPERTY_TYPE_OPTIONS.map((propertyType) => (
                <CheckboxItem
                  key={propertyType.value}
                  name="propertyTypes"
                  value={propertyType.value}
                  label={propertyType.label}
                  checked={selectedPropertyTypes.has(propertyType.value)}
                />
              ))}
            </div>
          </div>
          <CheckboxItem
            name="hasExclusiveRights"
            label="Can confirm exclusive rights or owner authorization"
            checked={application?.hasExclusiveRights}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="F"
        title="Operations capacity"
        description="Confirm the partner can support managed stays across check-in, cleaning, maintenance, and escalation."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextAreaField
            name="operationalCapacity"
            label="Operational capacity"
            value={application?.operationalCapacity}
            helper="Team size, cities covered, and daily operating coverage."
          />
          <TextAreaField
            name="checkInProcess"
            label="Check-in process"
            value={application?.checkInProcess}
          />
          <TextAreaField
            name="guestSupportCapacity"
            label="Guest support capacity"
            value={application?.guestSupportCapacity}
          />
          <TextAreaField
            name="cleaningProcess"
            label="Cleaning process"
            value={application?.cleaningProcess}
          />
          <TextAreaField
            name="maintenanceProcess"
            label="Maintenance process"
            value={application?.maintenanceProcess}
          />
          <div className="grid gap-5">
            <TextField
              name="emergencyContactName"
              label="Emergency contact name"
              value={application?.emergencyContactName}
            />
            <TextField
              name="emergencyContactPhone"
              label="Emergency contact phone"
              value={application?.emergencyContactPhone}
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        eyebrow="G"
        title="Compliance readiness"
        description="Confirm which compliance materials are ready for manual review."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <CheckboxItem
            name="canProvideInvoices"
            label="Can provide invoices"
            checked={application?.canProvideInvoices}
          />
          <CheckboxItem
            name="hasPropertyDocuments"
            label="Has property documents"
            checked={application?.hasPropertyDocuments}
          />
          <CheckboxItem
            name="hasTourismAuthorization"
            label="Has tourism authorization"
            checked={application?.hasTourismAuthorization}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="H"
        title="Platform rules and managed handover agreements"
        description="These agreements are required before submission."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <CheckboxItem
            name="acceptsPlatformRules"
            label="Accepts platform rules"
            helper="Partner agrees to marketplace quality, accuracy, and trust rules."
            checked={application?.acceptsPlatformRules}
          />
          <CheckboxItem
            name="acceptsManagedCommunication"
            label="Accepts managed communication"
            helper="Guest communication can be coordinated through platform operations."
            checked={application?.acceptsManagedCommunication}
          />
          <CheckboxItem
            name="acceptsHandoverPolicy"
            label="Accepts handover policy"
            helper="Partner agrees to future managed guest handover operating standards."
            checked={application?.acceptsHandoverPolicy}
          />
          <CheckboxItem
            name="acceptsCommissionModel"
            label="Accepts commission model"
            helper="Partner accepts marketplace commission review before listings go live."
            checked={application?.acceptsCommissionModel}
          />
        </div>
      </FormSection>

      <FormSection
        eyebrow="I"
        title="Final notes"
        description="Add context about the partner’s rental experience and readiness."
      >
        <TextAreaField
          name="businessExperience"
          label="Business experience and onboarding notes"
          value={application?.businessExperience}
          helper="Include Morocco rental experience, agency history, or co-host/operator context."
        />
      </FormSection>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Submit for operations review</p>
          <p className="text-sm text-muted-foreground">
            Drafts can be saved without all required fields. Submission is
            locked until the minimum onboarding fields are complete.
          </p>
        </div>
        <div className="flex gap-3">
          <Button type="submit" name="intent" value="draft" variant="outline">
            Save draft
          </Button>
          <Button type="submit" name="intent" value="submit">
            Submit
          </Button>
        </div>
      </div>
    </form>
  );
}

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await requireUser();

  if (user.role === "host_verified") {
    redirect("/partner/dashboard");
  }

  const application = await getLatestPartnerApplication(user.id);

  if (
    application?.status === "approved" &&
    !isAdminRole(user.role)
  ) {
    redirect("/partner/dashboard");
  }

  const errorMessage = getErrorMessage(searchParams?.error);
  const canEdit =
    !application ||
    application.status === "draft" ||
    application.status === "needs_information" ||
    application.status === "rejected";

  return (
    <section className="container mx-auto px-5 lg:px-10 mt-10 mb-12">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-medium text-muted-foreground">
            Managed Morocco partner onboarding
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Become a verified marketplace partner
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            The platform verifies partner identity, property authority,
            operating capacity, and compliance readiness before any listing can
            be published.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {errorMessage}
            </div>
          ) : null}
          {searchParams?.saved ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Draft saved.
            </div>
          ) : null}
          {searchParams?.submitted ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Application submitted. Operations will review it before listing
              access unlocks.
            </div>
          ) : null}

          <StatusPanel application={application} />

          {canEdit ? (
            <PartnerApplicationForm application={application} user={user} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Application locked</CardTitle>
                <CardDescription>
                  This application is not editable while it is submitted, under
                  review, approved, or suspended.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ReadinessPanel application={application} />
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Review sequence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Applicant completes identity and operations profile.</p>
              <p>2. Admin reviews risk, compliance, and operating readiness.</p>
              <p>3. Approved partners unlock listing creation and portfolio tools.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
