"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Search } from "lucide-react";
import { useState } from "react";
import { useCountries } from "../lib/getCountries";
import { HomeMap } from "./HomeMap";
import { Button } from "@/components/ui/button";
import { CreationSubmit } from "./SubmitButtons";
import { Card, CardHeader } from "@/components/ui/card";
import { Counter } from "./Counter";

export type SearchLabels = {
  anywhere: string;
  anyWeek: string;
  addGuests: string;
  search: string;
  selectCountry: string;
  countryDescription: string;
  countryPlaceholder: string;
  countries: string;
  stayDetails: string;
  stayDetailsDescription: string;
  guests: string;
  guestsHelp: string;
  rooms: string;
  roomsHelp: string;
  bathrooms: string;
  bathroomsHelp: string;
  next: string;
};

const defaultLabels: SearchLabels = {
  anywhere: "Anywhere",
  anyWeek: "Any Week",
  addGuests: "Add Guests",
  search: "Search",
  selectCountry: "Select a country",
  countryDescription: "Choose a destination to focus your stay search.",
  countryPlaceholder: "Select a country",
  countries: "Countries",
  stayDetails: "Stay details",
  stayDetailsDescription: "Add guests, rooms, and bathrooms for your search.",
  guests: "Guests",
  guestsHelp: "How many guests are traveling?",
  rooms: "Rooms",
  roomsHelp: "How many rooms do you need?",
  bathrooms: "Bathrooms",
  bathroomsHelp: "How many bathrooms do you need?",
  next: "Next",
};

export function SearchModalCompnent({ labels = defaultLabels }: { labels?: SearchLabels }) {
  const [step, setStep] = useState(1);
  const [locationValue, setLocationValue] = useState("");
  const { getAllCountries } = useCountries();

  function SubmitButtonLocal() {
    if (step === 1) {
      return (
        <Button onClick={() => setStep(step + 1)} type="button">
          {labels.next}
        </Button>
      );
    } else if (step === 2) {
      return <CreationSubmit />;
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex cursor-pointer items-center rounded-full border px-3 py-2 sm:px-5">
          <div className="hidden h-full divide-x font-medium sm:flex">
            <p className="px-4">{labels.anywhere}</p>
            <p className="px-4">{labels.anyWeek}</p>
            <p className="px-4">{labels.addGuests}</p>
          </div>
          <span className="px-2 text-sm font-medium sm:hidden">
            {labels.search}
          </span>

          <Search className="h-8 w-8 rounded-full bg-primary p-1 text-white" />
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form className="gap-4 flex flex-col">
          <input type="hidden" name="country" value={locationValue} />
          {step === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle>{labels.selectCountry}</DialogTitle>
                <DialogDescription>
                  {labels.countryDescription}
                </DialogDescription>
              </DialogHeader>

              <Select
                required
                onValueChange={(value) => setLocationValue(value)}
                value={locationValue}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={labels.countryPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{labels.countries}</SelectLabel>
                    {getAllCountries().map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.flag} {item.label} / {item.region}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <HomeMap locationValue={locationValue} />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{labels.stayDetails}</DialogTitle>
                <DialogDescription>
                  {labels.stayDetailsDescription}
                </DialogDescription>
              </DialogHeader>

              <Card>
                <CardHeader className="flex flex-col gap-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <h3 className="underline font-medium">{labels.guests}</h3>
                      <p className="text-muted-foreground text-sm">
                        {labels.guestsHelp}
                      </p>
                    </div>

                    <Counter name="guest" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <h3 className="underline font-medium">{labels.rooms}</h3>
                      <p className="text-muted-foreground text-sm">
                        {labels.roomsHelp}
                      </p>
                    </div>

                    <Counter name="room" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <h3 className="underline font-medium">
                        {labels.bathrooms}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {labels.bathroomsHelp}
                      </p>
                    </div>

                    <Counter name="bathroom" />
                  </div>
                </CardHeader>
              </Card>
            </>
          )}

          <DialogFooter>
            <SubmitButtonLocal />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
