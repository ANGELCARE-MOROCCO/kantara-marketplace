import { requireUser } from "@/app/lib/auth";
import { getTranslator } from "@/app/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AccountPage() {
  const [user, translator] = await Promise.all([requireUser(), getTranslator()]);
  const t = translator.t;
  const name = `${user.firstName} ${user.lastName}`.trim();

  return (
    <section className="container mx-auto px-5 lg:px-10 mt-10 mb-12">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("account", "title", "Account")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("account", "description", "Basic guest account details.")}
        </p>
      </div>

      <Card className="max-w-2xl mt-8">
        <CardHeader>
          <CardTitle className="text-xl">
            {t("account", "profile", "Profile")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("account", "name", "Name")}
            </p>
            <p className="font-medium mt-1">{name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {t("account", "email", "Email")}
            </p>
            <p className="font-medium mt-1 break-words">{user.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {t("account", "role", "Role")}
            </p>
            <p className="font-medium mt-1">{user.role}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
