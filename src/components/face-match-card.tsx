import { ScanFace } from "lucide-react";
import { useEffect, useState } from "react";

import { Pill } from "@/components/status";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Live photo against the PAN and Aadhaar photos (sql/046, aws document_finalize/face_match.py).
// Bands are provisional until policy settles them: 90+ match, 70–90 review, under 70 mismatch.

interface FaceMatch {
  doc_type: "PAN" | "AADHAAR";
  side: string;
  similarity: number | null;
  result: "MATCH" | "REVIEW" | "MISMATCH" | "NO_FACE";
  checked_at: string;
}

const LABEL: Record<FaceMatch["result"], [string, "success" | "warning" | "destructive" | "muted"]> = {
  MATCH: ["Match", "success"],
  REVIEW: ["Check by eye", "warning"],
  MISMATCH: ["Doesn't match", "destructive"],
  NO_FACE: ["No face found", "muted"],
};

export function FaceMatchCard({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<FaceMatch[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabase
      .rpc("fn_face_matches", { p_application_id: applicationId })
      .then(({ data, error }) => setRows(error ? [] : ((data as FaceMatch[]) ?? [])));
  }, [applicationId]);

  if (!rows || rows.length === 0) return null;
  return (
    <section className="panel p-5" aria-labelledby="face-match-title">
      <h2 id="face-match-title" className="flex items-center gap-2 text-sm font-semibold">
        <ScanFace className="size-4" aria-hidden="true" /> Face match: live photo against ID
      </h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {rows.map((r) => {
          const [label, tone] = LABEL[r.result];
          return (
            <li key={r.doc_type} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {r.doc_type === "PAN" ? "PAN card" : "Aadhaar"}
                <span className="text-muted-foreground"> ({r.side})</span>
              </span>
              <span className="flex items-center gap-2">
                {r.similarity !== null && (
                  <span className="tabular-nums text-muted-foreground">
                    {Number(r.similarity).toFixed(1)}%
                  </span>
                )}
                <Pill tone={tone}>{label}</Pill>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Similarity from Amazon Rekognition. 90%+ is a match, 70–90% needs a look, below 70% doesn't
        match.
      </p>
    </section>
  );
}
