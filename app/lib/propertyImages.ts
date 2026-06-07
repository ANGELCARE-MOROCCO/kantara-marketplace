export type HomeImageLike = {
  id?: string;
  url: string | null;
  altText?: string | null;
  sortOrder?: number | null;
  isCover?: boolean | null;
};

export type GalleryImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isCover: boolean;
};

const FALLBACK_SUPABASE_URL = "https://qmldhhoqmemkwpunqcka.supabase.co";

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    FALLBACK_SUPABASE_URL
  ).replace(/\/$/, "");
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function encodeStoragePath(path: string) {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveHomeImageUrl(pathOrUrl?: string | null) {
  const value = pathOrUrl?.trim();
  if (!value || value === "undefined" || value === "null") return null;
  if (isAbsoluteUrl(value)) return value;

  return `${getSupabaseUrl()}/storage/v1/object/public/images/${encodeStoragePath(
    value
  )}`;
}

export function buildHomeGallery({
  images,
  legacyPhoto,
  title,
}: {
  images?: HomeImageLike[] | null;
  legacyPhoto?: string | null;
  title?: string | null;
}) {
  const gallery = (images ?? [])
    .map((image, index) => {
      const url = resolveHomeImageUrl(image.url);
      if (!url) return null;

      return {
        id: image.id ?? `image-${index}`,
        url,
        altText: image.altText ?? title ?? "Property photo",
        sortOrder: image.sortOrder ?? index,
        isCover: image.isCover ?? false,
      };
    })
    .filter((image): image is GalleryImage => Boolean(image))
    .sort((a, b) => {
      if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  if (gallery.length > 0) return gallery.slice(0, 10);

  const legacyUrl = resolveHomeImageUrl(legacyPhoto);
  if (!legacyUrl) return [];

  return [
    {
      id: "legacy-photo",
      url: legacyUrl,
      altText: title ?? "Property photo",
      sortOrder: 0,
      isCover: true,
    },
  ];
}

export function getCoverImage({
  images,
  legacyPhoto,
  title,
}: {
  images?: HomeImageLike[] | null;
  legacyPhoto?: string | null;
  title?: string | null;
}) {
  return buildHomeGallery({ images, legacyPhoto, title })[0] ?? null;
}
