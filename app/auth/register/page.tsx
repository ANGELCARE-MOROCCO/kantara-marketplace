import Link from "next/link";
import { registerUser } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslator } from "@/app/lib/i18n";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { t } = await getTranslator();

  return (
    <main className="container mx-auto flex min-h-[70vh] items-center justify-center px-5">
      <div className="w-full max-w-md rounded-md border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("auth", "register.title", "Create your Kantara account")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "auth",
            "register.description",
            "Start as a guest. Partner and premium roles are managed by Kantara operations."
          )}
        </p>

        {searchParams?.error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Please fill all fields. Password must be at least 8 characters.
          </div>
        ) : null}

        <form action={registerUser} className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <Button type="submit" className="w-full">
            Register
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-primary underline" href="/auth/login">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
