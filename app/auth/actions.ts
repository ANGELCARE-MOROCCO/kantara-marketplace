"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import prisma from "../lib/db";
import { hashPassword, setAuthCookie, verifyPassword } from "../lib/auth";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function registerUser(formData: FormData) {
  const firstName = readString(formData, "firstName");
  const lastName = readString(formData, "lastName");
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");

  if (!firstName || !lastName || !email || password.length < 8) {
    redirect("/auth/register?error=missing-fields");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect("/auth/login?error=account-exists");
  }

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      firstName,
      lastName,
      passwordHash: hashPassword(password),
      profileImage: `https://avatar.vercel.sh/${encodeURIComponent(email)}`,
      role: "guest_basic",
    },
  });

  setAuthCookie(user.id);
  redirect("/");
}

export async function loginUser(formData: FormData) {
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/auth/login?error=invalid-credentials");
  }

  setAuthCookie(user.id);
  redirect("/");
}
