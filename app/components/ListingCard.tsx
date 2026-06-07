import Link from "next/link";
import { getCountryByValue } from "../lib/getCountries";
import { AddToFavoriteButton, DeleteFromFavoriteButton } from "./SubmitButtons";
import { DeleteFromFavorite, addToFavorite } from "../actions";
import { PropertyImage } from "./PropertyImage";
import { resolveHomeImageUrl } from "../lib/propertyImages";
import { getPropertyTypeLabel } from "../lib/propertyFeatures";
import { formatPlatformMoney } from "../lib/currency";
import type { CurrencyDisplayState } from "../lib/globalization";

interface ListingCardProps {
  imagePath?: string | null;
  imageAlt?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  city?: string | null;
  propertyType?: string | null;
  price?: number | null;
  userId: string | undefined;
  isInFavoriteList: boolean;
  favoriteId?: string | null;
  homeId: string;
  pathName: string;
  currencyState: CurrencyDisplayState;
  t?: (namespace: string, key: string, fallback: string) => string;
  labels?: {
    night?: string;
    priceOnRequest?: string;
    propertyDetailsPending?: string;
  };
}

function formatLocation(location?: string | null, city?: string | null) {
  const country = location ? getCountryByValue(location) : null;
  const countryLabel =
    country?.label ?? (location === "MA" ? "Morocco" : location) ?? "Morocco";

  return city ? `${city}, ${countryLabel}` : countryLabel;
}

export function ListingCard({
  description,
  imagePath,
  imageAlt,
  title,
  location,
  city,
  propertyType,
  price,
  userId,
  favoriteId,
  homeId,
  isInFavoriteList,
  pathName,
  currencyState,
  t,
  labels,
}: ListingCardProps) {
  const imageUrl = resolveHomeImageUrl(imagePath);
  const locationLabel = formatLocation(location, city);
  const propertyTypeLabel =
    getPropertyTypeLabel(propertyType, t) ?? propertyType?.replaceAll("_", " ");

  return (
    <div className="flex flex-col">
      <div className="relative h-72 overflow-hidden rounded-md bg-muted">
        <Link href={`/home/${homeId}`} aria-label={title ?? "Open listing"}>
          <PropertyImage
            src={imageUrl}
            alt={imageAlt ?? title ?? "Property photo"}
            fill
            className="object-cover transition duration-300 hover:scale-[1.02]"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
        </Link>

        {userId ? (
          <div className="absolute right-2 top-2 z-10">
            {isInFavoriteList && favoriteId ? (
              <form action={DeleteFromFavorite}>
                <input type="hidden" name="favoriteId" value={favoriteId} />
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="pathName" value={pathName} />
                <DeleteFromFavoriteButton />
              </form>
            ) : (
              <form action={addToFavorite}>
                <input type="hidden" name="homeId" value={homeId} />
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="pathName" value={pathName} />
                <AddToFavoriteButton />
              </form>
            )}
          </div>
        ) : null}
      </div>

      <Link href={`/home/${homeId}`} className="mt-3 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 font-medium text-base">
            {title ?? locationLabel}
          </h3>
          {propertyTypeLabel ? (
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              {propertyTypeLabel}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{locationLabel}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {description ??
            labels?.propertyDetailsPending ??
            "Property details are being prepared."}
        </p>
        <p className="pt-2 text-muted-foreground">
          {price ? (
            <>
              <span className="font-medium text-black">
                {formatPlatformMoney(price, currencyState)}
              </span>{" "}
              {labels?.night ?? "night"}
            </>
          ) : (
            <span className="font-medium text-black">
              {labels?.priceOnRequest ?? "Price on request"}
            </span>
          )}
        </p>
      </Link>
    </div>
  );
}
