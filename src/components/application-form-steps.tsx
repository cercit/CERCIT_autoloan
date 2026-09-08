import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface ApplicationFormStepProps {
  onSaveDraft?: (data: any) => void;
  onSubmit?: (data: any) => void;
  initialData?: any;
  className?: string;
}

export function ApplicationFormSteps({ onSaveDraft, onSubmit, initialData, className }: ApplicationFormStepProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: "", dob: "", pan: "", mobile: "", email: "", address: "", pincode: "",
    employer: "", designation: "", category: "A", employmentType: "Salaried", grossIncome: 0, netIncome: 0,
    vehicleMake: "", vehicleModel: "", segment: "car", exShowroom: 0, onRoad: 0, loanAmount: 0, tenure: 60, dealer: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) setData({ ...data, ...initialData });
    onSaveDraft?.(data);
  }, [data]);

  const validateStep0 = () => {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs['name'] = "Required";
    if (!data.dob) errs['dob'] = "Required";
    if (!data.pan || data.pan.length !== 10) errs['pan'] = "Valid PAN required";
    if (!data.mobile || !/^\d{10}$/.test(data.mobile)) errs['mobile'] = "10-digit mobile required";
    if (data.pincode && !/^\d{6}$/.test(data.pincode)) errs['pincode'] = "6-digit pincode";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!data.employer.trim()) errs['employer'] = "Required";
    if (data.grossIncome <= 0) errs['grossIncome'] = "Must be > 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!data.vehicleMake.trim()) errs['vehicleMake'] = "Required";
    if (!data.vehicleModel.trim()) errs['vehicleModel'] = "Required";
    if (data.loanAmount <= 0) errs['loanAmount'] = "Must be > 0";
    if (data.tenure < 12 || data.tenure > 84) errs['tenure'] = "12-84 months";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const OEM_LIST = ["Maruti Suzuki", "Hyundai", "Tata Motors", "Mahindra", "Kia", "Toyota", "Honda", "Renault", "MG Motor", "Skoda"];

  const steps = [
    { label: "Personal", fields: ["name", "dob", "pan", "mobile", "email", "address", "pincode"] },
    { label: "Employment", fields: ["employer", "designation", "category", "employmentType", "grossIncome", "netIncome"] },
    { label: "Loan & Vehicle", fields: ["vehicleMake", "vehicleModel", "segment", "exShowroom", "onRoad", "loanAmount", "tenure", "dealer"] },
    { label: "Review", fields: [] },
  ];

  return (
    <div className={cn("panel", className)}>
      <div className="flex gap-1 mb-5">
        {steps.map((s, i) => (
          <div key={s.label} className={cn("flex-1 h-1.5 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: "Full name", key: "name", type: "text" },
            { label: "Date of birth", key: "dob", type: "date" },
            { label: "PAN", key: "pan", type: "text" },
            { label: "Mobile", key: "mobile", type: "tel" },
            { label: "Email", key: "email", type: "email" },
            { label: "Address", key: "address", type: "text" },
            { label: "Pincode", key: "pincode", type: "text", span: 2 },
          ] as const).map((f) => (
            <div key={f.key} className={cn("space-y-1", 'span' in f && f.span === 2 && "col-span-2")}>
              <label htmlFor={f.key} className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <input id={f.key} type={f.type} value={(data as any)[f.key] || ""} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              {errors[f.key] && <p className="text-[10px] text-red-600">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: "Employer name", key: "employer", type: "text" },
            { label: "Designation", key: "designation", type: "text" },
            { label: "Category", key: "category", type: "select", options: ["A", "B", "C", "Unverified"] },
            { label: "Employment type", key: "employmentType", type: "text" },
            { label: "Gross monthly income", key: "grossIncome", type: "number" },
            { label: "Net monthly income", key: "netIncome", type: "number" },
          ] as const).map((f) => (
            <div key={f.key} className="space-y-1">
              <label htmlFor={f.key} className="text-xs font-medium text-muted-foreground">{f.label}</label>
              {f.type === "select" ? (
                <select id={f.key} value={(data as any)[f.key] || ""} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm bg-background">
                  {f.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input id={f.key} type={f.type} value={(data as any)[f.key] || ""} onChange={(e) => setData({ ...data, [f.key]: f.type === "number" ? Number(e.target.value) || 0 : e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
              )}
              {errors[f.key] && <p className="text-[10px] text-red-600">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: "Make", key: "vehicleMake", type: "select", options: ["Maruti Suzuki", "Hyundai", "Tata Motors", "Mahindra", "Kia", "Toyota", "Honda", "Renault", "MG Motor", "Skoda"] },
            { label: "Model", key: "vehicleModel", type: "text" },
            { label: "Segment", key: "segment", type: "select", options: ["car", "suv", "lcv", "scv", "3w"] },
            { label: "Ex-showroom (INR)", key: "exShowroom", type: "number" },
            { label: "On-road (INR)", key: "onRoad", type: "number" },
            { label: "Loan amount (INR)", key: "loanAmount", type: "number" },
            { label: "Tenure (months)", key: "tenure", type: "number" },
            { label: "Dealer", key: "dealer", type: "text" },
          ] as const).map((f) => (
            <div key={f.key} className={cn("space-y-1", (f.key === "dealer" || f.key === "exShowroom") ? "col-span-2" : undefined)}>
              <label htmlFor={f.key} className="text-xs font-medium text-muted-foreground">{f.label}</label>
              {f.type === "select" ? (
                <select id={f.key} value={(data as any)[f.key] || ""} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm bg-background">
                  {f.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input id={f.key} type={f.type} value={(data as any)[f.key] || ""} onChange={(e) => setData({ ...data, [f.key]: f.type === "number" ? Number(e.target.value) || 0 : e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
              )}
              {errors[f.key] && <p className="text-[10px] text-red-600">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Application Summary</h4>
          <div className="rounded-lg border bg-muted/20 p-4 grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Applicant</span><span className="text-right font-medium">{data.name}</span>
            <span className="text-muted-foreground">PAN</span><span className="text-right font-medium">{data.pan || "—"}</span>
            <span className="text-muted-foreground">Employer</span><span className="text-right font-medium">{data.employer || "—"}</span>
            <span className="text-muted-foreground">Vehicle</span><span className="text-right font-medium">{data.vehicleMake} {data.vehicleModel}</span>
            <span className="text-muted-foreground">Loan</span><span className="text-right font-medium">{data.loanAmount ? inr(data.loanAmount) : "—"}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Review all details before submitting.</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">Back</button>
        <button
          onClick={() => {
            if (step === 0 && !validateStep0()) return;
            if (step === 1 && !validateStep1()) return;
            if (step === 2 && !validateStep2()) return;
            if (step < 3) setStep((s) => s + 1);
            else onSubmit?.(data);
          }}
          className={cn("rounded-md px-5 py-2 text-sm font-medium text-white transition-colors", (step < 3 || (step === 3)) ? "bg-primary hover:bg-primary/90" : "bg-muted cursor-not-allowed")}
        >
          {step < 3 ? "Next" : "Submit"}
        </button>
      </div>
      <button type="button" onClick={() => onSaveDraft?.(data)} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline">Save draft</button>
    </div>
  );
}
