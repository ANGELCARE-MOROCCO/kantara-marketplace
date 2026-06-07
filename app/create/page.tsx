import { createKantaraHome } from "@/app/actions";
import { requireUser } from "@/app/lib/auth";
import { getTranslator } from "@/app/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CreatePage() {
  const [user, translator] = await Promise.all([requireUser(), getTranslator()]);
  const t = translator.t;
  const createHomeWithId = createKantaraHome.bind(null, {
    userId: user.id,
  });

  return (
    <section className="container mx-auto px-5 lg:px-10 mt-10 mb-12">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("createListing", "title", "List your property")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t(
            "createListing",
            "start_copy",
            "Start or continue the property setup flow."
          )}
        </p>
      </div>

      <Card className="max-w-2xl mt-8">
        <CardHeader>
          <CardTitle className="text-xl">
            {t("createListing", "property_setup", "Property setup")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createHomeWithId}>
            <Button type="submit">
              {t("common", "continue", "Continue")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
