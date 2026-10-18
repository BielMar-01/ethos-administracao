"use client";
import { useSyncExternalStore } from "react";
const query = "(max-width: 1023px)";
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const snapshot = () => window.matchMedia(query).matches;
export function useMobile() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
