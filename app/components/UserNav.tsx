/* eslint-disable @next/next/no-img-element */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { createKantaraHome } from "../actions";
import { getCurrentUser, isAdminRole } from "../lib/auth";
import { getTranslator } from "../lib/i18n";

export async function UserNav() {
  const [user, translator] = await Promise.all([
    getCurrentUser(),
    getTranslator(),
  ]);
  const t = translator.t;

  const createHomewithId = user
    ? createKantaraHome.bind(null, {
        userId: user.id,
      })
    : null;
  const isAdmin = isAdminRole(user?.role);
  const isHostPending = user?.role === "host_pending";
  const isHostVerified = user?.role === "host_verified";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="rounded-full border px-2 py-2 lg:px-4 lg:py-2 flex items-center gap-x-3">
          <MenuIcon className="w-6 h-6 lg:w-5 lg:h-5" />

          <img
            src={
              user?.profileImage ??
              "https://static.vecteezy.com/system/resources/thumbnails/009/292/244/small/default-avatar-icon-of-social-media-user-vector.jpg"
            }
            alt="Image of the user"
            className="rounded-full h-8 w-8 hidden lg:block"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]">
        {user && isAdmin ? (
          <>
            <DropdownMenuItem>
              <Link href="/admin" className="w-full">
                {t("navbar", "menu.admin", "Kantara Command Center")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/property-trust" className="w-full">
                {t("navbar", "menu.property_trust", "Property Trust Center")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/partner-operations" className="w-full">
                {t("navbar", "menu.partner_operations", "Partner Operations")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/globalization" className="w-full">
                {t(
                  "navbar",
                  "menu.currency_localization",
                  "Currency & Localization"
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/homepage-builder" className="w-full">
                {t("navbar", "menu.homepage_builder", "Homepage Builder")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/globalization?tab=translations" className="w-full">
                {t("navbar", "menu.localization_sync", "Localization Sync")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/admin/marketplace-operations" className="w-full">
                {t(
                  "navbar",
                  "menu.marketplace_operations",
                  "Marketplace Operations"
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/account" className="w-full">
                {t("common", "account", "Account")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/my-homes" className="w-full">
                {t("navbar", "menu.my_homes", "My homes")}
              </Link>
            </DropdownMenuItem>
            {createHomewithId ? (
              <DropdownMenuItem>
                <form action={createHomewithId} className="w-full">
                  <button type="submit" className="w-full text-start">
                    {t("navbar", "menu.list_property", "List your property")}
                  </button>
                </form>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/auth/logout" className="w-full">
                {t("navbar", "menu.logout", "Logout")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : user && isHostVerified ? (
          <>
            <DropdownMenuItem>
              <Link href="/account" className="w-full">
                {t("common", "account", "Account")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/partner/dashboard" className="w-full">
                {t("navbar", "menu.partner_dashboard", "Partner dashboard")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/my-homes" className="w-full">
                {t("navbar", "menu.my_homes", "My homes")}
              </Link>
            </DropdownMenuItem>
            {createHomewithId ? (
              <DropdownMenuItem>
                <form action={createHomewithId} className="w-full">
                  <button type="submit" className="w-full text-start">
                    {t("navbar", "menu.list_property", "List your property")}
                  </button>
                </form>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem>
              <Link href="/reservations" className="w-full">
                {t("common", "reservations", "Reservations")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/auth/logout" className="w-full">
                {t("navbar", "menu.logout", "Logout")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : user && isHostPending ? (
          <>
            <DropdownMenuItem>
              <Link href="/account" className="w-full">
                {t("common", "account", "Account")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/partner/dashboard" className="w-full">
                {t("navbar", "menu.partner_dashboard", "Partner dashboard")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/partner/apply" className="w-full">
                Application status
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/reservations" className="w-full">
                {t("common", "reservations", "Reservations")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/auth/logout" className="w-full">
                {t("navbar", "menu.logout", "Logout")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : user ? (
          <>
            <DropdownMenuItem>
              <Link href="/account" className="w-full">
                {t("common", "account", "Account")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/favorites" className="w-full">
                {t("common", "favorites", "Favorites")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/reservations" className="w-full">
                {t("common", "reservations", "Reservations")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/partner/apply" className="w-full">
                {t("common", "become_partner", "Become a partner")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/auth/logout" className="w-full">
                {t("navbar", "menu.logout", "Logout")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem>
              <Link href="/auth/register" className="w-full">
                {t("navbar", "menu.register", "Register")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/auth/login" className="w-full">
                {t("navbar", "menu.login", "Login")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
