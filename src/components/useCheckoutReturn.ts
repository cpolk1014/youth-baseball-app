"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * After sending someone to Stripe Checkout: if they come back without paying (the Back button,
 * or closing Stripe), the browser can restore this page exactly as it was, button still saying
 * "Opening checkout…". Call `reset` whenever the page is shown again.
 */
export function useCheckoutReturn(reset: () => void) {
  const onReturn = useEffectEvent(reset);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) onReturn();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onReturn();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
