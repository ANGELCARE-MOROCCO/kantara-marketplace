"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  Layers3,
  Lock,
  MonitorSmartphone,
  Palette,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useFormStatus } from "react-dom";

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
import { cn } from "@/lib/utils";
import { ConfigurableLogo } from "@/app/components/ConfigurableLogo";
import {
  BACKGROUND_STYLE_OPTIONS,
  BUTTON_STYLE_OPTIONS,
  CONTENT_WIDTH_OPTIONS,
  HERO_ALIGNMENT_OPTIONS,
  HERO_VISUAL_DENSITY_OPTIONS,
  HOMEPAGE_SECTION_TYPES,
  HOMEPAGE_THEME_MODES,
  LAYOUT_STYLE_OPTIONS,
  LOGO_DISPLAY_MODE_OPTIONS,
  LOGO_PLACEMENT_OPTIONS,
  LOGO_SIZE_OPTIONS,
  SECTION_ALIGNMENT_OPTIONS,
  SECTION_RADIUS_OPTIONS,
  SECTION_SPACING_OPTIONS,
  SECTION_THEME_STYLE_OPTIONS,
  type HomepageSectionView,
  type SiteBrandingView,
  getLogoDisplaySize,
  getSectionTypeLabel,
} from "@/app/lib/homepageConfig";
import {
  createHomepageSection,
  deleteHomepageSection,
  duplicateHomepageSection,
  loadDefaultHomepageSections,
  moveHomepageSectionDown,
  moveHomepageSectionUp,
  toggleHomepageSectionVisibility,
  updateHomepageSection,
  updateSiteBranding,
  uploadHomepageImage,
  uploadLogoImage,
} from "./actions";

type BuilderAsset = {
  id: string;
  sectionId: string | null;
  url: string;
  altText: string | null;
  type: string | null;
  sortOrder: number;
};

type HomepageBuilderClientProps = {
  sections: HomepageSectionView[];
  defaultSections: HomepageSectionView[];
  branding: SiteBrandingView;
  assets: BuilderAsset[];
  initialSelectedSectionId?: string | null;
  notice?: string | null;
  error?: string | null;
};

type SectionDraft = {
  id: string;
  type: string;
  isVisible: boolean;
  eyebrow: string;
  badgeText: string;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  imageUrl: string;
  backgroundImageUrl: string;
  layoutStyle: string;
  themeStyle: string;
  spacing: string;
  alignment: string;
  backgroundStyle: string;
  defaultDestinationFocus: string;
  metadataNotes: string;
};

type BuilderAction = (formData: FormData) => Promise<void>;

function getParamSafe(value?: string | null) {
  return value && value.trim() ? value : null;
}

function parseMetadata(metadata?: string | null) {
  if (!metadata) return {};

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
  fallback = ""
) {
  const value = metadata[key];
  return typeof value === "string" ? value : fallback;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionLabel(
  options: readonly { value: string; label: string }[],
  value?: string | null
) {
  return options.find((option) => option.value === value)?.label ?? value ?? "";
}

function logoPreviewSummary(branding: SiteBrandingView) {
  const desktopSize = getLogoDisplaySize(branding);
  const sizeLabel =
    optionLabel(LOGO_SIZE_OPTIONS, desktopSize.sizeKey) || "Medium";
  const heightLabel = desktopSize.height ? ` x ${desktopSize.height}px` : "";

  return `${sizeLabel} - desktop ${desktopSize.width}px${heightLabel}`;
}

function logoPreviewHelper(branding: SiteBrandingView) {
  const desktopSize = getLogoDisplaySize(branding);

  if (desktopSize.isCustom && desktopSize.usingCustomFallback) {
    return "Custom width and height are empty, so the Large default mapping is used.";
  }

  return desktopSize.height
    ? `Height ${desktopSize.height}px - max height ${desktopSize.maxHeight}px.`
    : `Height auto - max height ${desktopSize.maxHeight}px.`;
}

function sectionToDraft(section: HomepageSectionView): SectionDraft {
  const metadata = parseMetadata(section.metadata);

  return {
    id: section.id,
    type: section.type || "custom",
    isVisible: section.isVisible,
    eyebrow: section.eyebrow ?? "",
    badgeText: section.badgeText ?? "",
    title: section.title ?? "",
    subtitle: section.subtitle ?? "",
    body: section.body ?? "",
    ctaLabel: section.ctaLabel ?? "",
    ctaHref: section.ctaHref ?? "",
    secondaryCtaLabel: section.secondaryCtaLabel ?? "",
    secondaryCtaHref: section.secondaryCtaHref ?? "",
    imageUrl: section.imageUrl ?? "",
    backgroundImageUrl: section.backgroundImageUrl ?? "",
    layoutStyle: section.layoutStyle || "editorial",
    themeStyle: section.themeStyle || "default",
    spacing: section.spacing || "standard",
    alignment: section.alignment || "left",
    backgroundStyle: metadataString(metadata, "backgroundStyle", "clean"),
    defaultDestinationFocus: metadataString(
      metadata,
      "defaultDestinationFocus"
    ),
    metadataNotes: metadataString(metadata, "notes"),
  };
}

function draftToPreviewSection(
  section: HomepageSectionView,
  draft: SectionDraft
): HomepageSectionView {
  const metadata = parseMetadata(section.metadata);
  metadata.backgroundStyle = draft.backgroundStyle;
  metadata.defaultDestinationFocus =
    emptyToNull(draft.defaultDestinationFocus);
  metadata.notes = emptyToNull(draft.metadataNotes);

  return {
    ...section,
    type: draft.type,
    isVisible: draft.isVisible,
    eyebrow: emptyToNull(draft.eyebrow),
    badgeText: emptyToNull(draft.badgeText),
    title: emptyToNull(draft.title),
    subtitle: emptyToNull(draft.subtitle),
    body: emptyToNull(draft.body),
    ctaLabel: emptyToNull(draft.ctaLabel),
    ctaHref: emptyToNull(draft.ctaHref),
    secondaryCtaLabel: emptyToNull(draft.secondaryCtaLabel),
    secondaryCtaHref: emptyToNull(draft.secondaryCtaHref),
    imageUrl: emptyToNull(draft.imageUrl),
    backgroundImageUrl: emptyToNull(draft.backgroundImageUrl),
    layoutStyle: draft.layoutStyle,
    themeStyle: draft.themeStyle,
    spacing: draft.spacing,
    alignment: draft.alignment,
    metadata: JSON.stringify(metadata),
  };
}

function pickInitialSectionId(
  sections: HomepageSectionView[],
  initialSelectedSectionId?: string | null
) {
  if (
    initialSelectedSectionId &&
    sections.some((section) => section.id === initialSelectedSectionId)
  ) {
    return initialSelectedSectionId;
  }

  return sections[0]?.id ?? null;
}

function getNearestSurvivingSectionId(
  sections: HomepageSectionView[],
  sectionId: string
) {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return sections[0]?.id ?? null;

  return sections[index + 1]?.id ?? sections[index - 1]?.id ?? null;
}

function buildSelectionUrl(sectionId: string) {
  const params = new URLSearchParams(window.location.search);
  params.set("section", sectionId);
  params.delete("notice");
  params.delete("error");

  const query = params.toString();
  return `/admin/homepage-builder${query ? `?${query}` : ""}`;
}

export function HomepageBuilderClient({
  sections,
  defaultSections,
  branding,
  assets,
  initialSelectedSectionId,
  notice,
  error,
}: HomepageBuilderClientProps) {
  const hasSavedSections = sections.length > 0;
  const sectionsForList = useMemo(
    () => (hasSavedSections ? sections : defaultSections),
    [defaultSections, hasSavedSections, sections]
  );
  const sectionIds = useMemo(
    () => sectionsForList.map((section) => section.id).join("|"),
    [sectionsForList]
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() =>
    pickInitialSectionId(sectionsForList, initialSelectedSectionId)
  );

  useEffect(() => {
    setSelectedSectionId((currentSelectedId) => {
      const preferredId =
        getParamSafe(initialSelectedSectionId) ?? currentSelectedId;

      return pickInitialSectionId(sectionsForList, preferredId);
    });
  }, [initialSelectedSectionId, sectionIds, sectionsForList]);

  const selectedListSection =
    sectionsForList.find((section) => section.id === selectedSectionId) ??
    sectionsForList[0] ??
    null;
  const selectedSavedSection = hasSavedSections
    ? sections.find((section) => section.id === selectedListSection?.id) ?? null
    : null;
  const selectedSavedSnapshot = useMemo(
    () => (selectedSavedSection ? JSON.stringify(selectedSavedSection) : ""),
    [selectedSavedSection]
  );
  const [draft, setDraft] = useState<SectionDraft | null>(() =>
    selectedSavedSection ? sectionToDraft(selectedSavedSection) : null
  );

  useEffect(() => {
    setDraft(selectedSavedSection ? sectionToDraft(selectedSavedSection) : null);
  }, [selectedSavedSnapshot, selectedSavedSection]);

  const activeDraft =
    selectedSavedSection && draft?.id === selectedSavedSection.id
      ? draft
      : selectedSavedSection
        ? sectionToDraft(selectedSavedSection)
        : null;
  const previewSection =
    selectedSavedSection && activeDraft
      ? draftToPreviewSection(selectedSavedSection, activeDraft)
      : selectedListSection;
  const selectedAssets = assets.filter(
    (asset) => asset.sectionId === previewSection?.id
  );
  const isDraftDirty =
    Boolean(selectedSavedSection && activeDraft) &&
    JSON.stringify(activeDraft) !==
      JSON.stringify(sectionToDraft(selectedSavedSection as HomepageSectionView));

  function selectSection(sectionId: string) {
    const nextSavedSection = sections.find((section) => section.id === sectionId);

    setSelectedSectionId(sectionId);
    setDraft(nextSavedSection ? sectionToDraft(nextSavedSection) : null);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", buildSelectionUrl(sectionId));
    }
  }

  return (
    <section className="w-full max-w-none px-5 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Kantara Command Center
          </Link>
          <p className="mt-5 text-sm font-semibold text-emerald-700">
            Kantara homepage customization
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal lg:text-4xl">
            Homepage Builder
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Control homepage sections, brand visuals, logo, media, CTAs,
            ordering, and live public presentation.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/admin/globalization">Currency & Localization</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Open public homepage</Link>
          </Button>
          <form action={loadDefaultHomepageSections}>
            <Button type="submit" className="w-full gap-2 sm:w-auto">
              <Sparkles className="h-4 w-4" />
              Load default sections
            </Button>
          </form>
        </div>
      </div>

      {notice ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </div>
      ) : null}

      {!hasSavedSections ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Defaults are previewing</CardTitle>
            <CardDescription>
              The public homepage is using safe premium defaults because no
              database sections exist yet. Load defaults to persist and edit
              them.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <BrandingEditor
        branding={branding}
        selectedSectionId={selectedSectionId}
      />

      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <SectionListPanel
          sections={sectionsForList}
          selectedSectionId={selectedSectionId}
          hasSavedSections={hasSavedSections}
          onSelect={selectSection}
        />

        <SectionEditor
          section={selectedSavedSection}
          draft={activeDraft}
          setDraft={setDraft}
          selectedPreviewSection={previewSection}
          isDirty={isDraftDirty}
        />

        <PreviewPanel
          section={previewSection}
          branding={branding}
          assets={selectedAssets}
          isSaved={hasSavedSections}
          isDirty={isDraftDirty}
        />
      </div>
    </section>
  );
}

function BrandingEditor({
  branding,
  selectedSectionId,
}: {
  branding: SiteBrandingView;
  selectedSectionId: string | null;
}) {
  const previewSummary = logoPreviewSummary(branding);
  const previewHelper = logoPreviewHelper(branding);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Palette className="h-5 w-5 text-emerald-700" />
              Brand and theme controls
            </CardTitle>
            <CardDescription>
              Saved branding controls apply to the public navbar and homepage.
            </CardDescription>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
            Theme: {optionLabel(HOMEPAGE_THEME_MODES, branding.themeMode)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form action={updateSiteBranding} className="space-y-5">
            <input
              type="hidden"
              name="selectedId"
              value={selectedSectionId ?? ""}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DefaultTextField
                name="brandName"
                label="Brand name"
                value={branding.brandName}
                placeholder="Kantara"
              />
              <DefaultTextField
                name="logoHref"
                label="Logo link"
                value={branding.logoHref}
                placeholder="/"
              />
              <DefaultTextField
                name="logoAltText"
                label="Logo alt text"
                value={branding.logoAltText}
                placeholder="Kantara logo"
              />
              <DefaultSelectField
                name="logoDisplayMode"
                label="Logo visibility"
                value={branding.logoDisplayMode}
                options={LOGO_DISPLAY_MODE_OPTIONS}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              <DefaultSelectField
                name="logoPlacement"
                label="Logo placement"
                value={branding.logoPlacement}
                options={LOGO_PLACEMENT_OPTIONS}
              />
              <DefaultSelectField
                name="logoSize"
                label="Logo size"
                value={branding.logoSize}
                options={LOGO_SIZE_OPTIONS}
              />
              <DefaultTextField
                name="logoWidth"
                label="Custom desktop width"
                value={branding.logoWidth}
                type="number"
                placeholder="180"
                helper="Used only when Logo size is Custom."
              />
              <DefaultTextField
                name="logoHeight"
                label="Custom desktop height"
                value={branding.logoHeight}
                type="number"
                placeholder="auto or blank"
                helper="Leave blank for auto. Used only when Logo size is Custom."
              />
              <DefaultTextField
                name="mobileLogoWidth"
                label="Mobile logo width"
                value={branding.mobileLogoWidth}
                type="number"
                placeholder="96"
                helper="Used only when Logo size is Custom."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DefaultSelectField
                name="themeMode"
                label="Homepage theme"
                value={branding.themeMode}
                options={HOMEPAGE_THEME_MODES}
              />
              <DefaultSelectField
                name="heroAlignment"
                label="Hero alignment"
                value={branding.heroAlignment}
                options={HERO_ALIGNMENT_OPTIONS}
              />
              <DefaultSelectField
                name="heroVisualDensity"
                label="Hero visual density"
                value={branding.heroVisualDensity}
                options={HERO_VISUAL_DENSITY_OPTIONS}
              />
              <DefaultSelectField
                name="contentWidth"
                label="Content width"
                value={branding.contentWidth}
                options={CONTENT_WIDTH_OPTIONS}
              />
              <DefaultSelectField
                name="buttonStyle"
                label="Button style"
                value={branding.buttonStyle}
                options={BUTTON_STYLE_OPTIONS}
              />
              <DefaultSelectField
                name="sectionRadius"
                label="Section radius"
                value={branding.sectionRadius}
                options={SECTION_RADIUS_OPTIONS}
              />
              <DefaultTextField
                name="mobileLogoHeight"
                label="Mobile logo height"
                value={branding.mobileLogoHeight}
                type="number"
                placeholder="blank"
                helper="Leave blank for auto. Used only when Logo size is Custom."
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <DefaultToggleField
                name="showLogo"
                label="Show logo image"
                checked={branding.showLogo}
              />
              <DefaultToggleField
                name="showBrandName"
                label="Show brand name"
                checked={branding.showBrandName}
              />
              <DefaultToggleField
                name="showMetricsStrip"
                label="Show metrics strip"
                checked={branding.showMetricsStrip}
              />
              <DefaultToggleField
                name="showTrustPanels"
                label="Show trust panels"
                checked={branding.showTrustPanels}
              />
              <DefaultToggleField
                name="showFeaturedListings"
                label="Show featured listings"
                checked={branding.showFeaturedListings}
              />
              <DefaultToggleField
                name="showFooter"
                label="Show footer"
                checked={branding.showFooter}
              />
            </div>

            <PendingButton type="submit" className="gap-2">
              <Save className="h-4 w-4" />
              Save branding controls
            </PendingButton>
          </form>

          <div className="space-y-4 rounded-md border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-semibold text-stone-950">
                Logo preview
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {previewSummary}
              </p>
            </div>
            <div className="flex min-h-40 items-center justify-center rounded-md border bg-white p-6">
              {branding.logoUrl && branding.showLogo ? (
                <ConfigurableLogo
                  branding={branding}
                  className="justify-center text-center"
                />
              ) : (
                <div className="text-center">
                  <MonitorSmartphone className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">
                    {branding.brandName ?? "Kantara"}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {previewHelper}
            </p>
            <form action={uploadLogoImage} className="space-y-3">
              <input
                type="hidden"
                name="selectedId"
                value={selectedSectionId ?? ""}
              />
              <input
                type="hidden"
                name="brandName"
                value={branding.brandName ?? ""}
              />
              <input
                type="hidden"
                name="logoAltText"
                value={branding.logoAltText ?? ""}
              />
              <div className="space-y-2">
                <Label htmlFor="logo-upload">Upload logo image</Label>
                <Input
                  id="logo-upload"
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP, or AVIF. Maximum 3MB.
                </p>
              </div>
              <PendingButton
                type="submit"
                variant="outline"
                className="w-full gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload logo
              </PendingButton>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionListPanel({
  sections,
  selectedSectionId,
  hasSavedSections,
  onSelect,
}: {
  sections: HomepageSectionView[];
  selectedSectionId: string | null;
  hasSavedSections: boolean;
  onSelect: (sectionId: string) => void;
}) {
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers3 className="h-5 w-5 text-emerald-700" />
          Sections
        </CardTitle>
        <CardDescription>
          Add, duplicate, hide, show, delete, and reorder homepage blocks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createHomepageSection} className="rounded-md border p-4">
          <div className="space-y-4">
            <DefaultSelectField
              name="type"
              label="Add section type"
              value="custom"
              options={HOMEPAGE_SECTION_TYPES}
            />
            <DefaultTextField
              name="title"
              label="Optional title"
              placeholder="New homepage section"
            />
            <PendingButton type="submit" className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add section
            </PendingButton>
          </div>
        </form>

        <div className="space-y-3">
          {sections.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 p-5 text-center">
              <Layers3 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-stone-950">
                No sections yet
              </p>
            </div>
          ) : null}
          {sections.map((section, index) => {
            const isSelected = selectedSectionId === section.id;
            const nextSelectedId = getNearestSurvivingSectionId(
              sections,
              section.id
            );

            return (
              <div
                key={section.id}
                className={cn(
                  "rounded-md border bg-white p-3 transition",
                  isSelected
                    ? "border-emerald-500 shadow-md shadow-emerald-950/10 ring-2 ring-emerald-100"
                    : "hover:border-stone-400"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(section.id)}
                  aria-pressed={isSelected}
                  className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {String(index + 1).padStart(2, "0")} -{" "}
                        {getSectionTypeLabel(section.type)}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-stone-950">
                        {section.title ?? "Untitled section"}
                      </h3>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge
                        label={section.isVisible ? "Live" : "Hidden"}
                        tone={section.isVisible ? "green" : "muted"}
                      />
                      {section.isLocked ? (
                        <StatusBadge label="Locked" tone="amber" />
                      ) : null}
                    </div>
                  </div>
                </button>

                {hasSavedSections ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SectionActionForm
                      action={moveHomepageSectionUp}
                      sectionId={section.id}
                      selectedId={section.id}
                      label="Move up"
                      icon={ArrowUp}
                      disabled={index === 0}
                      onSubmitSelect={onSelect}
                    />
                    <SectionActionForm
                      action={moveHomepageSectionDown}
                      sectionId={section.id}
                      selectedId={section.id}
                      label="Move down"
                      icon={ArrowDown}
                      disabled={index === sections.length - 1}
                      onSubmitSelect={onSelect}
                    />
                    <SectionActionForm
                      action={toggleHomepageSectionVisibility}
                      sectionId={section.id}
                      selectedId={section.id}
                      label={section.isVisible ? "Hide" : "Show"}
                      icon={section.isVisible ? EyeOff : Eye}
                      onSubmitSelect={onSelect}
                    />
                    <SectionActionForm
                      action={duplicateHomepageSection}
                      sectionId={section.id}
                      selectedId={section.id}
                      label="Duplicate"
                      icon={Copy}
                      onSubmitSelect={onSelect}
                    />
                    <DeleteSectionForm
                      section={section}
                      selectedSectionId={selectedSectionId}
                      nextSelectedId={nextSelectedId}
                      onSubmitSelect={onSelect}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionActionForm({
  action,
  sectionId,
  selectedId,
  label,
  icon: Icon,
  disabled = false,
  onSubmitSelect,
}: {
  action: BuilderAction;
  sectionId: string;
  selectedId: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSubmitSelect: (sectionId: string) => void;
}) {
  return (
    <form
      action={action}
      onSubmit={() => {
        onSubmitSelect(sectionId);
      }}
    >
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="selectedId" value={selectedId} />
      <ActionSubmitButton
        label={label}
        icon={Icon}
        disabled={disabled}
      />
    </form>
  );
}

function DeleteSectionForm({
  section,
  selectedSectionId,
  nextSelectedId,
  onSubmitSelect,
}: {
  section: HomepageSectionView;
  selectedSectionId: string | null;
  nextSelectedId: string | null;
  onSubmitSelect: (sectionId: string) => void;
}) {
  const selectedAfterDelete =
    selectedSectionId === section.id ? nextSelectedId : selectedSectionId;

  return (
    <form
      action={deleteHomepageSection}
      className="col-span-2"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete "${section.title ?? "Untitled section"}"? This cannot be undone.`
        );

        if (!confirmed) {
          event.preventDefault();
          return;
        }

        if (selectedAfterDelete) {
          onSubmitSelect(selectedAfterDelete);
        }
      }}
    >
      <input type="hidden" name="sectionId" value={section.id} />
      <input type="hidden" name="selectedId" value={selectedSectionId ?? ""} />
      <input type="hidden" name="nextSelectedId" value={nextSelectedId ?? ""} />
      <ActionSubmitButton
        label={section.isLocked ? "Locked" : "Delete"}
        icon={section.isLocked ? Lock : Trash2}
        tone="destructive"
        disabled={section.isLocked}
      />
    </form>
  );
}

function SectionEditor({
  section,
  draft,
  setDraft,
  selectedPreviewSection,
  isDirty,
}: {
  section: HomepageSectionView | null;
  draft: SectionDraft | null;
  setDraft: Dispatch<SetStateAction<SectionDraft | null>>;
  selectedPreviewSection: HomepageSectionView | null;
  isDirty: boolean;
}) {
  return (
    <Card className="min-w-0 self-start">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-emerald-700" />
              Editor
            </CardTitle>
            <CardDescription>
              Edit copy, CTAs, media, layout, theme, spacing, and visibility.
            </CardDescription>
          </div>
          {section ? (
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={section.isVisible ? "Saved live" : "Saved hidden"}
                tone={section.isVisible ? "green" : "muted"}
              />
              {isDirty ? <StatusBadge label="Unsaved" tone="amber" /> : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!section || !draft ? (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-emerald-700" />
            <h3 className="mt-4 text-lg font-semibold">
              Save default sections to edit them
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You are previewing{" "}
              {selectedPreviewSection?.title ?? "the default homepage"}. Load
              default homepage sections or add a new section to create
              database-backed content.
            </p>
            <form action={loadDefaultHomepageSections} className="mt-5">
              <PendingButton type="submit" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Load defaults into database
              </PendingButton>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <form
              key={section.id}
              action={updateHomepageSection}
              className="space-y-5"
            >
              <input type="hidden" name="sectionId" value={section.id} />

              <div className="grid gap-4 md:grid-cols-2">
                <ControlledSelectField
                  id={`${section.id}-type`}
                  name="type"
                  label="Section type"
                  value={draft.type}
                  options={HOMEPAGE_SECTION_TYPES}
                  onChange={(type) =>
                    setDraft((current) =>
                      current ? { ...current, type } : current
                    )
                  }
                />
                <ControlledToggleField
                  name="isVisible"
                  label="Visible on public homepage"
                  checked={draft.isVisible}
                  helper="Hidden sections stay saved and selectable in the builder."
                  onChange={(isVisible) =>
                    setDraft((current) =>
                      current ? { ...current, isVisible } : current
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ControlledTextField
                  id={`${section.id}-eyebrow`}
                  name="eyebrow"
                  label="Eyebrow"
                  value={draft.eyebrow}
                  placeholder="Premium managed marketplace"
                  onChange={(eyebrow) =>
                    setDraft((current) =>
                      current ? { ...current, eyebrow } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-badgeText`}
                  name="badgeText"
                  label="Badge text"
                  value={draft.badgeText}
                  placeholder="Verified homes. Clear rules."
                  onChange={(badgeText) =>
                    setDraft((current) =>
                      current ? { ...current, badgeText } : current
                    )
                  }
                />
              </div>

              <ControlledTextField
                id={`${section.id}-title`}
                name="title"
                label="Title"
                value={draft.title}
                placeholder="Kantara stays, managed with confidence."
                onChange={(title) =>
                  setDraft((current) =>
                    current ? { ...current, title } : current
                  )
                }
              />
              <ControlledTextField
                id={`${section.id}-subtitle`}
                name="subtitle"
                label="Subtitle"
                value={draft.subtitle}
                placeholder="Premium stays. Reviewed partners. Managed journeys."
                onChange={(subtitle) =>
                  setDraft((current) =>
                    current ? { ...current, subtitle } : current
                  )
                }
              />
              <ControlledTextareaField
                id={`${section.id}-body`}
                name="body"
                label="Body"
                value={draft.body}
                rows={5}
                placeholder="Short production copy for this section."
                onChange={(body) =>
                  setDraft((current) =>
                    current ? { ...current, body } : current
                  )
                }
              />

              <div className="grid gap-4 md:grid-cols-2">
                <ControlledTextField
                  id={`${section.id}-ctaLabel`}
                  name="ctaLabel"
                  label="Primary CTA label"
                  value={draft.ctaLabel}
                  placeholder="Explore stays"
                  onChange={(ctaLabel) =>
                    setDraft((current) =>
                      current ? { ...current, ctaLabel } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-ctaHref`}
                  name="ctaHref"
                  label="Primary CTA link"
                  value={draft.ctaHref}
                  placeholder="/?country=MA#featured-stays"
                  onChange={(ctaHref) =>
                    setDraft((current) =>
                      current ? { ...current, ctaHref } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-secondaryCtaLabel`}
                  name="secondaryCtaLabel"
                  label="Secondary CTA label"
                  value={draft.secondaryCtaLabel}
                  placeholder="Become a partner"
                  onChange={(secondaryCtaLabel) =>
                    setDraft((current) =>
                      current ? { ...current, secondaryCtaLabel } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-secondaryCtaHref`}
                  name="secondaryCtaHref"
                  label="Secondary CTA link"
                  value={draft.secondaryCtaHref}
                  placeholder="/partner/apply"
                  onChange={(secondaryCtaHref) =>
                    setDraft((current) =>
                      current ? { ...current, secondaryCtaHref } : current
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ControlledTextField
                  id={`${section.id}-imageUrl`}
                  name="imageUrl"
                  label="Section image URL"
                  value={draft.imageUrl}
                  placeholder="https://..."
                  onChange={(imageUrl) =>
                    setDraft((current) =>
                      current ? { ...current, imageUrl } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-backgroundImageUrl`}
                  name="backgroundImageUrl"
                  label="Background image URL"
                  value={draft.backgroundImageUrl}
                  placeholder="https://..."
                  onChange={(backgroundImageUrl) =>
                    setDraft((current) =>
                      current ? { ...current, backgroundImageUrl } : current
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ControlledSelectField
                  id={`${section.id}-layoutStyle`}
                  name="layoutStyle"
                  label="Layout style"
                  value={draft.layoutStyle}
                  options={LAYOUT_STYLE_OPTIONS}
                  onChange={(layoutStyle) =>
                    setDraft((current) =>
                      current ? { ...current, layoutStyle } : current
                    )
                  }
                />
                <ControlledSelectField
                  id={`${section.id}-themeStyle`}
                  name="themeStyle"
                  label="Theme style"
                  value={draft.themeStyle}
                  options={SECTION_THEME_STYLE_OPTIONS}
                  onChange={(themeStyle) =>
                    setDraft((current) =>
                      current ? { ...current, themeStyle } : current
                    )
                  }
                />
                <ControlledSelectField
                  id={`${section.id}-spacing`}
                  name="spacing"
                  label="Section spacing"
                  value={draft.spacing}
                  options={SECTION_SPACING_OPTIONS}
                  onChange={(spacing) =>
                    setDraft((current) =>
                      current ? { ...current, spacing } : current
                    )
                  }
                />
                <ControlledSelectField
                  id={`${section.id}-alignment`}
                  name="alignment"
                  label="Alignment"
                  value={draft.alignment}
                  options={SECTION_ALIGNMENT_OPTIONS}
                  onChange={(alignment) =>
                    setDraft((current) =>
                      current ? { ...current, alignment } : current
                    )
                  }
                />
                <ControlledSelectField
                  id={`${section.id}-backgroundStyle`}
                  name="backgroundStyle"
                  label="Background style"
                  value={draft.backgroundStyle}
                  options={BACKGROUND_STYLE_OPTIONS}
                  onChange={(backgroundStyle) =>
                    setDraft((current) =>
                      current ? { ...current, backgroundStyle } : current
                    )
                  }
                />
                <ControlledTextField
                  id={`${section.id}-defaultDestinationFocus`}
                  name="defaultDestinationFocus"
                  label="Default destination focus"
                  value={draft.defaultDestinationFocus}
                  placeholder="Marrakech"
                  onChange={(defaultDestinationFocus) =>
                    setDraft((current) =>
                      current
                        ? { ...current, defaultDestinationFocus }
                        : current
                    )
                  }
                />
              </div>

              <ControlledTextareaField
                id={`${section.id}-metadataNotes`}
                name="metadataNotes"
                label="Internal metadata notes"
                value={draft.metadataNotes}
                rows={3}
                placeholder="Optional editor notes. Stored as section metadata."
                onChange={(metadataNotes) =>
                  setDraft((current) =>
                    current ? { ...current, metadataNotes } : current
                  )
                }
              />

              <PendingButton type="submit" className="gap-2">
                <Save className="h-4 w-4" />
                Save selected section
              </PendingButton>
            </form>

            <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-2">
              <SectionUploadForm
                section={section}
                suggestedAltText={draft.title || section.title}
                imageKind="section_image"
                title="Upload section image"
                description="Used by custom and media-capable sections."
              />
              <SectionUploadForm
                section={section}
                suggestedAltText={draft.title || section.title}
                imageKind="background_image"
                title="Upload background image"
                description="Stored as the selected section background image."
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionUploadForm({
  section,
  suggestedAltText,
  imageKind,
  title,
  description,
}: {
  section: HomepageSectionView;
  suggestedAltText?: string | null;
  imageKind: "section_image" | "background_image";
  title: string;
  description: string;
}) {
  const formId = `${section.id}-${imageKind}`;

  return (
    <form
      key={formId}
      action={uploadHomepageImage}
      className="space-y-3 rounded-md bg-white p-4"
    >
      <input type="hidden" name="sectionId" value={section.id} />
      <input type="hidden" name="imageKind" value={imageKind} />
      <div>
        <p className="text-sm font-semibold text-stone-950">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <DefaultTextField
        id={`${formId}-altText`}
        name="altText"
        label="Alt text"
        value={suggestedAltText}
        placeholder="Describe the image"
      />
      <Input
        name="image"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
      />
      <PendingButton type="submit" variant="outline" className="w-full gap-2">
        <Upload className="h-4 w-4" />
        Upload image
      </PendingButton>
    </form>
  );
}

function PreviewPanel({
  section,
  branding,
  assets,
  isSaved,
  isDirty,
}: {
  section: HomepageSectionView | null;
  branding: SiteBrandingView;
  assets: BuilderAsset[];
  isSaved: boolean;
  isDirty: boolean;
}) {
  if (!section) {
    return (
      <Card className="self-start xl:sticky xl:top-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-emerald-700" />
            Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">No section selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const imageUrl = section.backgroundImageUrl ?? section.imageUrl;

  return (
    <Card className="min-w-0 self-start xl:sticky xl:top-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5 text-emerald-700" />
          Preview
        </CardTitle>
        <CardDescription>
          Active selected-section preview with visibility, type, and media.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!section.isVisible ? (
          <div className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-100 p-3 text-sm text-stone-700">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Hidden sections remain editable here, but the public homepage
              does not render them.
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "overflow-hidden rounded-md border shadow-sm",
            section.themeStyle === "dark"
              ? "border-stone-800 bg-stone-950 text-white"
              : section.themeStyle === "green"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : section.themeStyle === "warm"
                  ? "border-orange-200 bg-orange-50 text-stone-950"
                  : "bg-white text-stone-950"
          )}
        >
          <div
            className="flex min-h-44 items-center justify-center bg-stone-100 bg-cover bg-center"
            style={{
              backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            }}
          >
            {!imageUrl ? (
              <div className="rounded-md border border-dashed bg-white/85 px-5 py-4 text-center text-muted-foreground shadow-sm">
                <ImageIcon className="mx-auto h-8 w-8" />
                <p className="mt-2 text-xs font-semibold">
                  Section media placeholder
                </p>
              </div>
            ) : null}
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-md border border-current/15 px-2 py-1">
                {isSaved ? "Database section" : "Default preview"}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-1",
                  section.isVisible
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-stone-100 text-stone-600"
                )}
              >
                {section.isVisible ? "Visible" : "Hidden"}
              </span>
              {isDirty ? (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">
                  Unsaved preview
                </span>
              ) : null}
              <span className="rounded-md border border-current/15 px-2 py-1">
                Order {section.sortOrder}
              </span>
            </div>
            <p className="text-xs font-semibold opacity-65">
              {section.eyebrow ?? getSectionTypeLabel(section.type)}
            </p>
            <h3 className="break-words text-2xl font-semibold leading-8">
              {section.title ?? "Untitled homepage section"}
            </h3>
            {section.subtitle ? (
              <p className="break-words text-sm font-semibold opacity-80">
                {section.subtitle}
              </p>
            ) : null}
            {section.body ? (
              <p className="break-words text-sm leading-6 opacity-70">
                {section.body}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {section.ctaLabel ? (
                <span className="rounded-md bg-stone-950 px-3 py-2 text-xs font-semibold text-white">
                  {section.ctaLabel}
                </span>
              ) : null}
              {section.secondaryCtaLabel ? (
                <span className="rounded-md border border-current/20 px-3 py-2 text-xs font-semibold">
                  {section.secondaryCtaLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <PreviewStat label="Type" value={getSectionTypeLabel(section.type)} />
          <PreviewStat
            label="Layout"
            value={optionLabel(LAYOUT_STYLE_OPTIONS, section.layoutStyle)}
          />
          <PreviewStat
            label="Theme"
            value={optionLabel(SECTION_THEME_STYLE_OPTIONS, section.themeStyle)}
          />
          <PreviewStat
            label="Spacing"
            value={optionLabel(SECTION_SPACING_OPTIONS, section.spacing)}
          />
          <PreviewStat
            label="Homepage theme"
            value={optionLabel(HOMEPAGE_THEME_MODES, branding.themeMode)}
          />
          <PreviewStat label="Assets" value={`${assets.length} uploaded`} />
          <PreviewStat
            label="Image"
            value={section.imageUrl ? "Set" : "Not set"}
          />
          <PreviewStat
            label="Background"
            value={section.backgroundImageUrl ? "Set" : "Not set"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "muted" | "amber";
}) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-xs font-semibold",
        tone === "green"
          ? "bg-emerald-50 text-emerald-800"
          : tone === "amber"
            ? "bg-amber-100 text-amber-900"
            : "bg-stone-100 text-stone-600"
      )}
    >
      {label}
    </span>
  );
}

function ActionSubmitButton({
  label,
  icon: Icon,
  tone = "default",
  disabled = false,
}: {
  label: string;
  icon: LucideIcon;
  tone?: "default" | "destructive";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "destructive"
          ? "border-red-200 text-red-700 hover:bg-red-50"
          : "hover:bg-muted"
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{pending ? "Working" : label}</span>
    </button>
  );
}

function PendingButton({
  children,
  className,
  disabled,
  ...props
}: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={pending || disabled} className={className}>
      {children}
    </Button>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function DefaultSelectField({
  name,
  label,
  value,
  options,
  helper,
}: {
  name: string;
  label: string;
  value?: string | null;
  options: readonly { value: string; label: string }[];
  helper?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`default-${name}`}>{label}</Label>
      <select
        id={`default-${name}`}
        name={name}
        defaultValue={value ?? options[0]?.value}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
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

function DefaultTextField({
  id,
  name,
  label,
  value,
  placeholder,
  type = "text",
  helper,
}: {
  id?: string;
  name: string;
  label: string;
  value?: string | number | null;
  placeholder?: string;
  type?: string;
  helper?: string;
}) {
  const inputId = id ?? `default-${name}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function DefaultToggleField({
  name,
  label,
  checked,
  helper,
}: {
  name: string;
  label: string;
  checked: boolean;
  helper?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-white p-3">
      <input type="hidden" name={name} value="false" />
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={checked}
        className="mt-1 h-4 w-4 rounded border-stone-300"
      />
      <span>
        <span className="block text-sm font-semibold text-stone-950">
          {label}
        </span>
        {helper ? (
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            {helper}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function ControlledSelectField({
  id,
  name,
  label,
  value,
  options,
  onChange,
  helper,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
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

function ControlledTextField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  helper?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ControlledTextareaField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ControlledToggleField({
  name,
  label,
  checked,
  onChange,
  helper,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string;
}) {
  return (
    <label className="flex min-h-10 items-start gap-3 rounded-md border bg-white p-3">
      <input type="hidden" name={name} value="false" />
      <input
        type="checkbox"
        name={name}
        value="true"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-stone-300"
      />
      <span>
        <span className="block text-sm font-semibold text-stone-950">
          {label}
        </span>
        {helper ? (
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            {helper}
          </span>
        ) : null}
      </span>
    </label>
  );
}
