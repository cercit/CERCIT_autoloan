export type ApplicationStatus =
  | "New"
  | "Documents Uploaded"
  | "Under Review"
  | "Referred"
  | "Sanctioned"
  | "Rejected"
  | "ESCALATED"
  | "HOLD";

const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  New: ["Documents Uploaded", "Rejected"],
  "Documents Uploaded": ["Under Review", "Rejected"],
  "Under Review": ["Sanctioned", "Rejected", "Referred", "HOLD"],
  Referred: ["Sanctioned", "Rejected", "Under Review"],
  Sanctioned: [],
  Rejected: [],
  ESCALATED: ["Under Review", "Rejected"],
  HOLD: ["Under Review", "Rejected"],
};

export function isValidTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return (validTransitions[from] ?? []).includes(to);
}

export function getAvailableTransitions(
  current: ApplicationStatus,
): ApplicationStatus[] {
  return validTransitions[current] ?? [];
}
