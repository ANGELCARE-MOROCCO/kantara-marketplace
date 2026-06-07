import Link from "next/link";
import { loginUser } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslator } from "@/app/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { t } = await getTranslator();

  return (
    <main className="container mx-auto flex min-h-[70vh] items-center justify-center px-5">
      <div className="w-full max-w-md rounded-md border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("auth", "login.title", "Log in to Kantara")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "auth",
            "login.description",
            "Access your Kantara marketplace account."
          )}
        </p>

        {searchParams?.error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Invalid email or password.
          </div>
        ) : null}

        <form action={loginUser} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full">
            Login
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          No account yet?{" "}
          <Link className="font-medium text-primary underline" href="/auth/register">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
