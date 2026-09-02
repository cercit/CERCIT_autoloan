import type { ReactNode } from "react";

const COMPANY = {
  name: "cercit Vehicle Finance Ltd",
  cin: "U65923TN2024PLC123456",
  rbiReg: "N-13.02345",
  address: "4th Floor, Sterling Towers, Anna Salai, Chennai 600002",
  phone: "+91 44 2852 0000",
  email: "loans@cercit.in",
  web: "www.cercit.in",
  gstin: "33AABCC1234F1Z5",
};

export { COMPANY };

function LetterHead() {
  return (
    <header className="letter-head flex items-start justify-between border-b-2 border-slate-800 pb-3">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-md bg-blue-600 text-xl font-bold text-white">
          c
        </span>
        <div>
          <p className="text-base font-bold text-slate-900">{COMPANY.name}</p>
          <p className="text-[10px] leading-tight text-slate-500">
            CIN: {COMPANY.cin} | RBI Reg. No.: {COMPANY.rbiReg}
          </p>
          <p className="text-[10px] leading-tight text-slate-500">
            Regd. Office: {COMPANY.address}
          </p>
        </div>
      </div>
      <div className="text-right text-[10px] leading-tight text-slate-500">
        <p>{COMPANY.phone}</p>
        <p>{COMPANY.email}</p>
        <p>{COMPANY.web}</p>
      </div>
    </header>
  );
}

function LetterFooter({ showGrievance }: { showGrievance?: boolean }) {
  return (
    <footer className="letter-footer mt-auto border-t border-slate-300 pt-2 text-[8px] leading-tight text-slate-400">
      {showGrievance && (
        <div className="mb-1.5 text-[9px] text-slate-500">
          <span className="font-semibold">Grievance Redressal:</span>{" "}
          Nodal Officer — Mr. K. Venkataraman, {COMPANY.phone}, grievance@cercit.in |{" "}
          Banking Ombudsman: https://cms.rbi.org.in
        </div>
      )}
      <p>
        {COMPANY.name} is a Non-Banking Financial Company registered with the Reserve Bank of India
        under Section 45-IA of the RBI Act, 1934. Registration No.: {COMPANY.rbiReg}.
        GSTIN: {COMPANY.gstin}.
      </p>
      <p className="mt-0.5">
        This is a system-generated document. For digitally signed copies, contact your branch
        or write to {COMPANY.email}.
      </p>
    </footer>
  );
}

export function LetterLayout({
  id,
  children,
  showGrievance,
}: {
  id?: string;
  children: ReactNode;
  showGrievance?: boolean;
}) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .letter-page, .letter-page * { visibility: visible !important; }
          .letter-page {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 15mm 20mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <article
        id={id}
        className="letter-page mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white p-[15mm_20mm] text-[11px] leading-[1.6] text-slate-800 shadow-lg"
        style={{ fontFamily: "'Inter', 'Noto Sans', sans-serif" }}
      >
        <LetterHead />
        <div className="mt-4 flex-1">{children}</div>
        <LetterFooter showGrievance={showGrievance} />
      </article>
    </>
  );
}

export function LetterTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={label} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
            <td className="w-[45%] border border-slate-300 px-3 py-1.5 text-slate-600">
              {label}
            </td>
            <td className="border border-slate-300 px-3 py-1.5 font-medium">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function formatLetterDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
