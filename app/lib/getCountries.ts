import countries from "world-countries";

const countriesFormatted = countries
  .map((item) => ({
    value: item.cca2,
    label: item.name.common,
    flag: item.flag,
    latLang: item.latlng,
    region: item.region,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Convert to regular functions instead of a hook
export const getAllCountries = () => countriesFormatted;

export const getCountryByValue = (value: string) => {
  return countriesFormatted.find((item) => item.value === value);
};

// Keep the hook for client components
export const useCountries = () => {
  return {
    getAllCountries,
    getCountryByValue,
  };
};
