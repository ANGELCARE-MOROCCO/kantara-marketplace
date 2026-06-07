"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCountries } from "../lib/getCountries";
import { icon } from "leaflet";

const ICON = icon({
  iconUrl:
    "https://images.vexels.com/media/users/3/131261/isolated/preview/b2e48580147ca0ed3f970f30bf8bb009-karten-standortmarkierung.png",
  iconSize: [50, 50],
});

const MOROCCO_CENTER: [number, number] = [31.7917, -7.0926];

export default function Map({ locationValue }: { locationValue: string }) {
  const { getCountryByValue } = useCountries();
  const latLang = getCountryByValue(locationValue)?.latLang ?? MOROCCO_CENTER;
  return (
    <MapContainer
      scrollWheelZoom={false}
      className="h-[50vh] rounded-lg relative z-0"
      center={latLang}
      zoom={8}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={latLang} icon={ICON} />
    </MapContainer>
  );
}
