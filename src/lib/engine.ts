import type { Application } from "@/lib/mock-data";

export type LTVAssessment = {
  ltvExShowroom: number;
  ltvOnRoad: number;
  maxAllowedLtv: number;
  categoryLabel: string;
  breached: boolean;
};

export type HardFilterResult = {
  passed: boolean;
  failures: string[];
};

export function runHardFilters(app: Application): HardFilterResult {
  const failures: string[] = [];

  if (app.age < 21) failures.push("Applicant age below minimum (21)");
  if (app.age > 60) failures.push("Applicant age above maximum (60)");
  if (app.cibil < 600) failures.push(`CIBIL score ${app.cibil} below hard floor (600)`);
  if (!app.pan.trim()) failures.push("PAN number is missing");
  if (!app.city.trim()) failures.push("City is missing");
  if (app.loanAmount <= 0) failures.push("Loan amount must be greater than zero");

  return { passed: failures.length === 0, failures };
}

const maxLtvByCategory: Record<string, number> = {
  A: 120,
  B: 110,
  C: 90,
};

export function calculateLTV(app: Application): LTVAssessment {
  const ltvExShowroom =
    app.exShowroom > 0
      ? Math.round((app.loanAmount / app.exShowroom) * 1000) / 10
      : 0;

  const ltvOnRoad =
    app.onRoad > 0
      ? Math.round((app.loanAmount / app.onRoad) * 1000) / 10
      : 0;

  const maxAllowedLtv = maxLtvByCategory[app.category] ?? 90;

  const breached = ltvExShowroom > maxAllowedLtv;

  return {
    ltvExShowroom,
    ltvOnRoad,
    maxAllowedLtv,
    categoryLabel: `Category ${app.category} — max ${maxAllowedLtv}%`,
    breached,
  };
}
