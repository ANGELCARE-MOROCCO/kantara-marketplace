import { requireAdmin } from "@/app/lib/auth";
import { HomepageBuilderClient } from "./HomepageBuilderClient";
import { getHomepageBuilderState } from "./actions";

type SearchParams = {
  section?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

function getParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomepageBuilderPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const state = await getHomepageBuilderState();

  return (
    <HomepageBuilderClient
      sections={state.sections}
      defaultSections={state.defaultSections}
      branding={state.branding}
      assets={state.assets}
      initialSelectedSectionId={getParam(searchParams, "section") ?? null}
      notice={getParam(searchParams, "notice") ?? null}
      error={getParam(searchParams, "error") ?? null}
    />
  );
}
