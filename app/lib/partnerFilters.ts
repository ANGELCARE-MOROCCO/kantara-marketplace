export const PARTNER_LIFECYCLE_FILTERS = [
  { value: "", label: "All lifecycle states" },
  { value: "qualification_review", label: "Qualification review" },
  { value: "needs_information", label: "Needs information" },
  { value: "verification_required", label: "Verification required" },
  { value: "supply_preparation", label: "Supply preparation" },
  { value: "marketplace_ready", label: "Marketplace ready" },
  { value: "active_supply", label: "Active supply" },
  { value: "quality_watch", label: "Quality watch" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
] as const;

export const PARTNER_DECISION_FILTERS = [
  { value: "", label: "Any decision state" },
  { value: "requires_decision", label: "Requires decision" },
  { value: "blocked_supply", label: "Blocked supply" },
  { value: "verification_gap", label: "Verification gap" },
  { value: "incident_exposure", label: "Incident exposure" },
  { value: "marketplace_ready", label: "Marketplace ready" },
  { value: "no_supply", label: "No submitted supply" },
] as const;

export function normalizePartnerSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
