"use client";

import { Analytics } from "@vercel/analytics/next";
import { analyticsUrl } from "@/lib/analytics/url";

/**
 * Vercel Web Analytics: page views and visitors (no cookies). Each page's address is cleaned
 * first, so invite links, shared tournament links, codes and record ids never leave.
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: analyticsUrl(event.url) })} />;
}
