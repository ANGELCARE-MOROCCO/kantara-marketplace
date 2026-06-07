import Link from "next/link";
import { cn } from "@/lib/utils";
import { getPublicSiteBranding } from "../lib/siteBranding";
import { getCurrencyDisplayState } from "../lib/currency";
import { getLocalizationDisplayState, getTranslator } from "../lib/i18n";
import { ConfigurableLogo } from "./ConfigurableLogo";
import { CurrencySelector } from "./CurrencySelector";
import { LanguageSelector } from "./LanguageSelector";
import { UserNav } from "./UserNav";
import { SearchModalCompnent } from "./SearchComponent";

export async function Navbar() {
  const [branding, currencyState, localizationState, translator] =
    await Promise.all([
      getPublicSiteBranding(),
      getCurrencyDisplayState(),
      getLocalizationDisplayState(),
      getTranslator(),
    ]);
  const t = translator.t;
  const searchLabels = {
    anywhere: t("search", "trigger.anywhere", "Anywhere"),
    anyWeek: t("search", "trigger.any_week", "Any Week"),
    addGuests: t("search", "trigger.add_guests", "Add Guests"),
    search: t("search", "trigger.search", "Search"),
    selectCountry: t("search", "select_country", "Select a country"),
    countryDescription: t(
      "search",
      "country_description",
      "Choose a destination to focus your stay search."
    ),
    countryPlaceholder: t("search", "country_placeholder", "Select a country"),
    countries: t("search", "countries", "Countries"),
    stayDetails: t("search", "stay_details", "Stay details"),
    stayDetailsDescription: t(
      "search",
      "stay_details_description",
      "Add guests, rooms, and bathrooms for your search."
    ),
    guests: t("common", "guests", "Guests"),
    guestsHelp: t("search", "guests_help", "How many guests are traveling?"),
    rooms: t("search", "rooms", "Rooms"),
    roomsHelp: t("search", "rooms_help", "How many rooms do you need?"),
    bathrooms: t("common", "bathrooms", "Bathrooms"),
    bathroomsHelp: t(
      "search",
      "bathrooms_help",
      "How many bathrooms do you need?"
    ),
    next: t("search", "next", "Next"),
  };
  const placement = ["left", "center", "right"].includes(branding.logoPlacement)
    ? branding.logoPlacement
    : "left";
  const logoHref = branding.logoHref || "/";
  const desktopLogo = (
    <Link
      href={logoHref}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center",
        placement === "center" ? "justify-center" : ""
      )}
    >
      <ConfigurableLogo branding={branding} />
    </Link>
  );
  const mobileLogo = (
    <Link
      href={logoHref}
      className="inline-flex min-w-0 max-w-[42vw] shrink-0 items-center overflow-hidden"
    >
      <ConfigurableLogo branding={branding} compact />
    </Link>
  );
  const renderSearch = () => <SearchModalCompnent labels={searchLabels} />;
  const renderUtilityCluster = () => (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <CurrencySelector
        selectedCurrency={currencyState.selectedCurrency}
        enabledCurrencies={currencyState.enabledCurrencies}
        label={t("navbar", "selector.currency", "Currency")}
      />
      <LanguageSelector
        selectedLanguage={localizationState.selectedLanguage}
        enabledLanguages={localizationState.enabledLanguages}
        label={t("navbar", "selector.language", "Language")}
      />
      <UserNav />
    </div>
  );

  return (
    <nav className="w-full border-b">
      <div className="container mx-auto px-4 py-4 sm:px-5 lg:px-10 lg:py-5">
        <div className="hidden min-w-0 items-center gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center justify-start">
            {placement === "left" ? desktopLogo : renderSearch()}
          </div>

          <div className="flex min-w-0 items-center justify-center">
            {placement === "center"
              ? desktopLogo
              : placement === "left"
                ? renderSearch()
                : null}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-4">
            {placement === "right" ? desktopLogo : null}
            {renderUtilityCluster()}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {mobileLogo}
            {renderUtilityCluster()}
          </div>
          <div className="flex min-w-0 justify-center">
            {renderSearch()}
          </div>
        </div>
      </div>
    </nav>
  );
}
