"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "@/lib/finance/money";

const noSubscription = () => () => {};

/** Today's date (YYYY-MM-DD) on the device; "" while rendering on the server. */
export function useToday(): string {
  return useSyncExternalStore(noSubscription, localToday, () => "");
}
