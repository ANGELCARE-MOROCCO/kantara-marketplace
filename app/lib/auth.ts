import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import prisma from "./db";

export const AUTH_COOKIE_NAME = "marketplace_user_id";
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export type InternalUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  role: string;
};

export const ADMIN_ROLES = ["admin", "super_admin"];
export const HOST_ROLES = ["host_pending", "host_verified"];

export function isAdminRole(role?: string | null) {
  return ADMIN_ROLES.includes(role ?? "");
}

export function isHostRole(role?: string | null) {
  return HOST_ROLES.includes(role ?? "");
}

export function canManageListings(role?: string | null) {
  return role === "host_verified" || isAdminRole(role);
}

export async function getCurrentUser(): Promise<InternalUser | null> {
  const userId = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      profileImage: true,
      role: true,
    },
  });

  return user;
}

export async function requireCurrentUser() {
  return requireUser();
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/");
  return user;
}

export async function requireHostVerified() {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (user.role === "host_pending") redirect("/partner/dashboard");
  if (user.role !== "host_verified") redirect("/");

  return user;
}

export async function requireListingPublisher() {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (user.role === "host_pending") redirect("/partner/dashboard");
  if (!canManageListings(user.role)) redirect("/");

  return user;
}

export async function requireListingEditor(homeId: string) {
  const user = await requireListingPublisher();

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      userId: true,
      listingStatus: true,
      contentReviewStatus: true,
    },
  });

  if (!home) redirect("/");
  if (home.userId !== user.id && !isAdminRole(user.role)) redirect("/");

  return { user, home };
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");

  return `${PBKDF2_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;

  const [iterationsRaw, salt, originalHash] = storedHash.split(":");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !originalHash) return false;

  const comparisonHash = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, "hex"),
    Buffer.from(comparisonHash, "hex")
  );
}

export function setAuthCookie(userId: string) {
  cookies().set(AUTH_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAuthCookie() {
  cookies().delete(AUTH_COOKIE_NAME);
}
