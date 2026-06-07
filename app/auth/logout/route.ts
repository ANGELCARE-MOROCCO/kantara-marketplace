import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/app/lib/auth";

export async function GET() {
  clearAuthCookie();
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
