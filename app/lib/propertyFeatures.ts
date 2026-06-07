export type PropertyFeature = {
  key: string;
  label: string;
};

export type PropertyFeatureGroup = {
  group: string;
  title: string;
  description: string;
  features: PropertyFeature[];
};

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "riad", label: "Riad" },
  { value: "dar", label: "Dar" },
  { value: "guesthouse", label: "Guesthouse" },
  { value: "hotel_apartment", label: "Hotel apartment" },
  { value: "studio", label: "Studio" },
  { value: "private_room", label: "Private room" },
  { value: "shared_room", label: "Shared room" },
  { value: "farm_stay", label: "Farm stay" },
  { value: "surf_house", label: "Surf house" },
  { value: "desert_camp", label: "Desert camp" },
  { value: "mountain_lodge", label: "Mountain lodge" },
  { value: "luxury_residence", label: "Luxury residence" },
  { value: "traditional_house", label: "Traditional house" },
  { value: "beach_house", label: "Beach house" },
  { value: "resort_unit", label: "Resort unit" },
] as const;

export const STAY_TYPES = [
  { value: "entire_place", label: "Entire place" },
  { value: "private_room", label: "Private room" },
  { value: "shared_space", label: "Shared space" },
] as const;

export const PROPERTY_FEATURE_GROUPS: PropertyFeatureGroup[] = [
  {
    group: "core_amenities",
    title: "Core amenities",
    description: "Everyday comfort, connectivity, and essentials.",
    features: [
      { key: "wifi", label: "Wifi" },
      { key: "fiber_internet", label: "Fiber internet" },
      { key: "air_conditioning", label: "Air conditioning" },
      { key: "heating", label: "Heating" },
      { key: "washer", label: "Washer" },
      { key: "dryer", label: "Dryer" },
      { key: "iron", label: "Iron" },
      { key: "workspace", label: "Workspace" },
      { key: "tv", label: "TV" },
      { key: "smart_tv", label: "Smart TV" },
      { key: "safe_box", label: "Safe box" },
      { key: "wardrobe", label: "Wardrobe" },
      { key: "hair_dryer", label: "Hair dryer" },
      { key: "hot_water", label: "Hot water" },
      { key: "essentials", label: "Essentials" },
      { key: "private_entrance", label: "Private entrance" },
    ],
  },
  {
    group: "kitchen_dining",
    title: "Kitchen and dining",
    description: "Cooking, dining, and food storage features.",
    features: [
      { key: "kitchen", label: "Kitchen" },
      { key: "kitchenette", label: "Kitchenette" },
      { key: "refrigerator", label: "Refrigerator" },
      { key: "freezer", label: "Freezer" },
      { key: "oven", label: "Oven" },
      { key: "microwave", label: "Microwave" },
      { key: "stove", label: "Stove" },
      { key: "coffee_machine", label: "Coffee machine" },
      { key: "kettle", label: "Kettle" },
      { key: "toaster", label: "Toaster" },
      { key: "dishwasher", label: "Dishwasher" },
      { key: "dining_table", label: "Dining table" },
      { key: "cooking_basics", label: "Cooking basics" },
      { key: "dishes_cutlery", label: "Dishes and cutlery" },
    ],
  },
  {
    group: "comfort_climate",
    title: "Comfort and climate",
    description: "Outdoor spaces, views, and premium comfort features.",
    features: [
      { key: "pool", label: "Pool" },
      { key: "private_pool", label: "Private pool" },
      { key: "heated_pool", label: "Heated pool" },
      { key: "jacuzzi", label: "Jacuzzi" },
      { key: "hammam", label: "Hammam" },
      { key: "fireplace", label: "Fireplace" },
      { key: "terrace", label: "Terrace" },
      { key: "balcony", label: "Balcony" },
      { key: "garden", label: "Garden" },
      { key: "patio", label: "Patio" },
      { key: "rooftop", label: "Rooftop" },
      { key: "sea_view", label: "Sea view" },
      { key: "mountain_view", label: "Mountain view" },
      { key: "medina_view", label: "Medina view" },
      { key: "desert_view", label: "Desert view" },
      { key: "courtyard", label: "Courtyard" },
      { key: "bbq_area", label: "BBQ area" },
    ],
  },
  {
    group: "family_accessibility",
    title: "Family and accessibility",
    description: "Family support and accessibility indicators.",
    features: [
      { key: "baby_bed", label: "Baby bed" },
      { key: "high_chair", label: "High chair" },
      { key: "family_friendly", label: "Family friendly" },
      { key: "children_books_toys", label: "Children books and toys" },
      { key: "step_free_access", label: "Step-free access" },
      { key: "elevator", label: "Elevator" },
      { key: "wide_doorways", label: "Wide doorways" },
      { key: "accessible_bathroom", label: "Accessible bathroom" },
      { key: "ground_floor", label: "Ground floor" },
      { key: "wheelchair_accessible", label: "Wheelchair accessible" },
    ],
  },
  {
    group: "security_safety",
    title: "Security and safety",
    description: "Safety equipment, monitoring, and staffed support.",
    features: [
      { key: "smoke_alarm", label: "Smoke alarm" },
      { key: "carbon_monoxide_alarm", label: "Carbon monoxide alarm" },
      { key: "fire_extinguisher", label: "Fire extinguisher" },
      { key: "first_aid_kit", label: "First aid kit" },
      { key: "security_cameras", label: "Security cameras" },
      { key: "doorman", label: "Doorman" },
      { key: "gated_property", label: "Gated property" },
      { key: "onsite_staff", label: "Onsite staff" },
      { key: "night_guard", label: "Night guard" },
    ],
  },
  {
    group: "parking_transport",
    title: "Parking and transport",
    description: "Parking, charging, and local transport support.",
    features: [
      { key: "free_parking", label: "Free parking" },
      { key: "paid_parking", label: "Paid parking" },
      { key: "garage", label: "Garage" },
      { key: "street_parking", label: "Street parking" },
      { key: "ev_charger", label: "EV charger" },
      { key: "airport_transfer_available", label: "Airport transfer available" },
      { key: "car_rental_help", label: "Car rental help" },
      { key: "driver_available", label: "Driver available" },
    ],
  },
  {
    group: "services",
    title: "Services",
    description: "Optional services that can support premium stays.",
    features: [
      { key: "daily_cleaning", label: "Daily cleaning" },
      { key: "weekly_cleaning", label: "Weekly cleaning" },
      { key: "breakfast_available", label: "Breakfast available" },
      { key: "chef_available", label: "Chef available" },
      { key: "concierge", label: "Concierge" },
      { key: "laundry_service", label: "Laundry service" },
      { key: "grocery_delivery", label: "Grocery delivery" },
      { key: "tour_booking_help", label: "Tour booking help" },
      { key: "childcare_available", label: "Childcare available" },
      { key: "housekeeping", label: "Housekeeping" },
      { key: "luggage_dropoff", label: "Luggage dropoff" },
    ],
  },
  {
    group: "morocco_specific",
    title: "Morocco-specific",
    description: "Local realities and marketplace-specific search signals.",
    features: [
      { key: "traditional_riad", label: "Traditional riad" },
      { key: "medina_location", label: "Medina location" },
      { key: "beach_access", label: "Beach access" },
      { key: "surf_friendly", label: "Surf friendly" },
      { key: "desert_excursion_access", label: "Desert excursion access" },
      { key: "mountain_retreat", label: "Mountain retreat" },
      { key: "near_souk", label: "Near souk" },
      { key: "near_mosque", label: "Near mosque" },
      { key: "near_train_station", label: "Near train station" },
      { key: "near_airport", label: "Near airport" },
      { key: "near_marina", label: "Near marina" },
      { key: "near_golf", label: "Near golf" },
      { key: "alcohol_free_property", label: "Alcohol-free property" },
      { key: "couple_friendly", label: "Couple friendly" },
      { key: "family_only_option", label: "Family-only option" },
      { key: "local_breakfast", label: "Local breakfast" },
      { key: "moroccan_decor", label: "Moroccan decor" },
      { key: "staffed_property", label: "Staffed property" },
    ],
  },
  {
    group: "rules_policies",
    title: "Rules and policies",
    description: "Guest rules and operational requirements.",
    features: [
      { key: "smoking_allowed", label: "Smoking allowed" },
      { key: "pets_allowed", label: "Pets allowed" },
      { key: "events_allowed", label: "Events allowed" },
      { key: "parties_allowed", label: "Parties allowed" },
      { key: "children_allowed", label: "Children allowed" },
      { key: "couples_allowed", label: "Couples allowed" },
      { key: "unmarried_couples_policy", label: "Unmarried couples policy" },
      { key: "quiet_hours", label: "Quiet hours" },
      { key: "long_term_stays", label: "Long-term stays" },
      { key: "self_checkin", label: "Self check-in" },
      { key: "host_greeting", label: "Host greeting" },
      { key: "passport_required", label: "Passport required" },
      { key: "deposit_required", label: "Deposit required" },
    ],
  },
  {
    group: "business_premium",
    title: "Business and premium",
    description: "Commercial readiness and premium marketplace signals.",
    features: [
      { key: "luxury_collection", label: "Luxury collection" },
      { key: "verified_property", label: "Verified property" },
      { key: "professionally_managed", label: "Professionally managed" },
      { key: "premium_guest_eligible", label: "Premium guest eligible" },
      { key: "cash_to_host_eligible", label: "Cash-to-host eligible" },
      { key: "business_travel_ready", label: "Business travel ready" },
      { key: "monthly_discount", label: "Monthly discount" },
      { key: "weekly_discount", label: "Weekly discount" },
    ],
  },
];

export const PROPERTY_FEATURES = PROPERTY_FEATURE_GROUPS.flatMap((group) =>
  group.features.map((feature) => ({
    ...feature,
    group: group.group,
    groupTitle: group.title,
  }))
);

type Translate = (namespace: string, key: string, fallback: string) => string;

export function getPropertyFeatureByKey(key: string) {
  return PROPERTY_FEATURES.find((feature) => feature.key === key);
}

export function getPropertyTypeLabel(value?: string | null, t?: Translate) {
  const item = PROPERTY_TYPES.find((propertyType) => propertyType.value === value);
  if (!item) return null;

  return t ? t("taxonomy", `property_type.${item.value}`, item.label) : item.label;
}

export function getStayTypeLabel(value?: string | null, t?: Translate) {
  const item = STAY_TYPES.find((stayType) => stayType.value === value);
  if (!item) return null;

  return t ? t("taxonomy", `stay_type.${item.value}`, item.label) : item.label;
}

export function getPropertyFeatureLabel(key: string, fallback: string, t?: Translate) {
  return t ? t("taxonomy", `feature.${key}`, fallback) : fallback;
}

export function getPropertyFeatureGroupTitle(
  group: string,
  fallback: string,
  t?: Translate
) {
  return t ? t("taxonomy", `feature_group.${group}.title`, fallback) : fallback;
}

export function getPropertyFeatureGroupDescription(
  group: string,
  fallback: string,
  t?: Translate
) {
  return t
    ? t("taxonomy", `feature_group.${group}.description`, fallback)
    : fallback;
}
