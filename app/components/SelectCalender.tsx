"use client";

import { DateRange } from "react-date-range";
import { useState } from "react";

// Import these required CSS files
import "react-date-range/dist/styles.css"; // main style file
import "react-date-range/dist/theme/default.css"; // theme css file

// Import the required locale from date-fns
import { enUS } from "date-fns/locale";

interface SelectCalenderProps {
  reservation?: {
    startDate: Date;
    endDate: Date;
  }[];
}

export function SelectCalender({ reservation }: SelectCalenderProps) {
  const [state, setState] = useState([
    {
      startDate: new Date(),
      endDate: new Date(),
      key: "selection",
    },
  ]);

  // Function to check if date is disabled based on existing reservations
  const dateIsReserved = (date: Date) => {
    let reserved = false;
    if (reservation) {
      reserved = reservation.some((r) => {
        const start = new Date(r.startDate);
        const end = new Date(r.endDate);
        return date >= start && date <= end;
      });
    }
    return reserved;
  };

  // Function to get all dates in a range
  const getDatesInRange = (startDate: Date, endDate: Date) => {
    const dates: Date[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  };

  // Function to get all reserved dates
  const getAllReservedDates = () => {
    if (!reservation || reservation.length === 0) return [];

    const allReservedDates: Date[] = [];

    reservation.forEach((r) => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const datesInRange = getDatesInRange(start, end);
      allReservedDates.push(...datesInRange);
    });

    return allReservedDates;
  };

  return (
    <div className="flex flex-col gap-4 mt-6">
      <DateRange
        date={new Date()}
        onChange={(item) => setState([item.selection] as any)}
        moveRangeOnFirstSelection={false}
        months={1}
        ranges={state}
        direction="vertical"
        rangeColors={["#FF385C"]}
        locale={enUS} // Explicitly providing the locale
        minDate={new Date()}
        disabledDates={getAllReservedDates()}
        className="w-full"
      />

      <input
        type="hidden"
        name="startDate"
        value={state[0].startDate.toISOString()}
      />
      <input
        type="hidden"
        name="endDate"
        value={state[0].endDate.toISOString()}
      />
    </div>
  );
}
