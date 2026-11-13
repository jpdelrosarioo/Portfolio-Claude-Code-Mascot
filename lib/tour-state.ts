// Whether the visitor has already been shown the tour (remembered in this browser), shared by the tour and the mascot.
import { tour } from "@/data/site";

export const TOUR_SEEN = "tour-seen";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN) === "1";
  } catch {
    return true; // can't remember anything here (private window): don't start it by itself on every visit
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN, "1");
  } catch {}
}

/** The tour is going to start by itself on this visit (the visitor's first). */
export const tourWillAutoStart = () => tour.enabled && tour.autoStart && !tourSeen();
