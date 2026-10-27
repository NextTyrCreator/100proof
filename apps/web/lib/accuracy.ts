/**
 * Scan correctness is not the 90% recognition hold.
 * A reviewed item is kept or corrected. The score is kept / (kept + corrected).
 * These ratios are goals. They are not a measured result of the product today.
 */
export const ACCURACY_FLOOR = 0.95;
export const ACCURACY_AIM = 0.98;

export type ScanReview = {
  confirmed: number;
  corrected: number;
};

export function reviewedCount(review: ScanReview) {
  return review.confirmed + review.corrected;
}

/** Null until at least one item has been kept or corrected. */
export function itemCorrectness(review: ScanReview): number | null {
  const reviewed = reviewedCount(review);
  if (reviewed <= 0) return null;
  return review.confirmed / reviewed;
}

export function meetsAccuracyFloor(review: ScanReview) {
  const score = itemCorrectness(review);
  return score !== null && score >= ACCURACY_FLOOR;
}
