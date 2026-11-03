"use client";

/** Take "?paid=1" out of the address, so a refresh doesn't say "Payment received" again. */
export function clearPaidFlag(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("paid")) return;
  url.searchParams.delete("paid");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
