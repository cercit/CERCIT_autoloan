import { useState, useMemo } from "react";
import { inr } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export interface EmiScheduleProps {
  principal: number;
  annualRate: number;
  months: number;
  className?: string;
}

export function EmiSchedule({
  principal,
  annualRate,
  months,
  className,
}: EmiScheduleProps) {
  const [showAll, setShowAll] = useState(false);

  const schedule = useMemo(() => {
    const rows: {
      month: number;
      opening: number;
      emi: number;
      interest: number;
      principalPaid: number;
      closing: number;
    }[] = [];

    if (annualRate === 0) {
      const emi = principal / months;
      let balance = principal;
      for (let i = 1; i <= months; i++) {
        const opening = balance;
        const interest = 0;
        const principalPaid = emi;
        const closing = Math.max(0, opening - principalPaid);
        rows.push({
          month: i,
          opening,
          emi,
          interest,
          principalPaid,
          closing,
        });
        balance = closing;
      }
    } else {
      const r = annualRate / 12 / 100;
      const emi =
        (principal * r * Math.pow(1 + r, months)) /
        (Math.pow(1 + r, months) - 1);
      let balance = principal;
      for (let i = 1; i <= months; i++) {
        const opening = balance;
        const interest = opening * r;
        const principalPaid = emi - interest;
        const closing = opening - principalPaid;
        rows.push({
          month: i,
          opening,
          emi,
          interest,
          principalPaid,
          closing,
        });
        balance = closing;
      }
    }
    return rows;
  }, [principal, annualRate, months]);

  const totalPayment = schedule.reduce((sum, row) => sum + row.emi, 0);
  const totalInterest = totalPayment - principal;

  const visibleRows = showAll ? schedule : schedule.slice(0, 12);

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Principal: </span>
          <span className="font-medium">{inr(principal)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Payment: </span>
          <span className="font-medium">{inr(totalPayment)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Interest: </span>
          <span className="font-medium">{inr(totalInterest)}</span>
        </div>
      </div>

      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Opening</TableHead>
            <TableHead>EMI</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Closing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow key={row.month}>
              <TableCell>{row.month}</TableCell>
              <TableCell>{inr(row.opening)}</TableCell>
              <TableCell>{inr(row.emi)}</TableCell>
              <TableCell>{inr(row.interest)}</TableCell>
              <TableCell>{inr(row.principalPaid)}</TableCell>
              <TableCell>{inr(row.closing)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {months > 12 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? "Show less" : `Show all ${months} months`}
        </Button>
      )}
    </div>
  );
}