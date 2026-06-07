import { getCurrentUser } from "../lib/auth";
import prisma from "../lib/db";
import { redirect } from "next/navigation";
import { NoItems } from "../components/NoItem";
import { ListingCard } from "../components/ListingCard";
import { unstable_noStore as noStore } from "next/cache";
import { getCurrencyDisplayState } from "../lib/currency";
import { getTranslator } from "../lib/i18n";
import {
  applyApprovedListingTranslations,
  getPublicListingDescription,
  getPublicListingTitle,
} from "../lib/listingContent";

async function getData(userId: string) {
  noStore();
  const data = await prisma.favorite.findMany({
    where: {
      userId: userId,
    },
    select: {
      id: true,
      Home: {
        select: {
          photo: true,
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          propertyType: true,
          price: true,
          country: true,
          description: true,
          approvedDescription: true,
          approvedNeighborhood: true,
          images: {
            orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
            select: {
              url: true,
              altText: true,
            },
          },
        },
      },
    },
  });

  return data;
}

export default async function FavoriteRoute() {
  const user = await getCurrentUser();
  if (!user) return redirect("/");
  const [data, currencyState, translator] = await Promise.all([
    getData(user.id),
    getCurrencyDisplayState(),
    getTranslator(),
  ]);
  const t = translator.t;
  const translatedHomes = new Map(
    (
      await applyApprovedListingTranslations(
        data.flatMap((item) => (item.Home ? [item.Home] : [])),
        translator.language
      )
    ).map((home) => [home.id, home])
  );

  return (
    <section className="container mx-atuo px-5 lg:px-10 mt-10">
      <h2 className="text-3xl font-semibold tracking-tight">
        {t("favorites", "title", "Your favorites")}
      </h2>

      {data.length === 0 ? (
        <NoItems
          title={t("favorites", "empty_title", "No favorites yet")}
          description={t(
            "favorites",
            "empty_description",
            "Save properties to review them here."
          )}
        />
      ) : (
        <div className="grid lg:grid-cols-4 sm:grid-cols-2 md:grid-cols-3 grid-cols-1 gap-8 mt-8">
          {data.map((item) =>
            item.Home ? (
              <ListingCard
                key={item.Home.id}
                title={getPublicListingTitle(translatedHomes.get(item.Home.id) ?? item.Home)}
                description={getPublicListingDescription(
                  translatedHomes.get(item.Home.id) ?? item.Home
                )}
                location={item.Home.country}
                city={item.Home.city}
                propertyType={item.Home.propertyType}
                pathName="/favorites"
                homeId={item.Home.id}
                imagePath={item.Home.images[0]?.url ?? item.Home.photo}
                imageAlt={item.Home.images[0]?.altText ?? item.Home.title}
                price={item.Home.price}
                currencyState={currencyState}
                t={t}
                labels={{
                  night: t("common", "night", "night"),
                  priceOnRequest: t(
                    "common",
                    "price_on_request",
                    "Price on request"
                  ),
                  propertyDetailsPending: t(
                    "listing",
                    "stay_details_reviewed",
                    "Stay details reviewed"
                  ),
                }}
                userId={user.id}
                favoriteId={item.id}
                isInFavoriteList={true}
              />
            ) : null
          )}
        </div>
      )}
    </section>
  );
}
