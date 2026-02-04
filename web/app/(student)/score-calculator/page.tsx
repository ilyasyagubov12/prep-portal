"use client";

import { useMemo, useState } from "react";

type ExamKey = "sat" | "ielts";

const sections: { key: ExamKey; title: string; description: string }[] = [
  { key: "sat", title: "SAT", description: "Reading & Writing + Math. Enter correct answers per module." },
  { key: "ielts", title: "IELTS", description: "Listening, Reading, Writing, Speaking → 0–9 band (nearest .5)." },
];

export default function Page() {
  const [active, setActive] = useState<ExamKey>("sat");
  const [sat, setSat] = useState({ verbal1: 0, verbal2: 0, math1: 0, math2: 0 });
  const [ielts, setIelts] = useState({ listening: 0, reading: 0, writing: 0, speaking: 0 });

  const satTotals = useMemo(() => {
    const verbal = sat.verbal1 + sat.verbal2;
    const math = sat.math1 + sat.math2;
    const verbalPct = Math.round((verbal / 54) * 100);
    const mathPct = Math.round((math / 44) * 100);
    const verbalScaled = satVerbalScale[verbal] ?? scaleFallback(verbal, 54);
    const mathScaled = satMathScale[math] ?? scaleFallback(math, 44);
    const totalScaled = Math.min(1600, verbalScaled + mathScaled);
    return {
      verbal,
      math,
      verbalPct,
      mathPct,
      totalRaw: verbal + math,
      totalPossible: 98,
      verbalScaled,
      mathScaled,
      totalScaled,
    };
  }, [sat]);

  const ieltsOverall = useMemo(() => {
    const avgRaw = (ielts.listening + ielts.reading + ielts.writing + ielts.speaking) / 4;
    const overall = roundHalf(avgRaw);
    return { avgRaw, overall, cefr: ieltsToCefr(overall) };
  }, [ielts]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-neutral-900 text-white grid place-items-center font-bold">S</div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">Score Calculator</h1>
            <p className="text-sm text-neutral-600">Switch exams, enter scores, get a clean summary.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-2xl border bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {sections.map((s) => {
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={[
                    "rounded-xl px-4 py-3 text-left transition border",
                    isActive
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{s.title}</div>
                    <span
                      className={[
                        "text-xs px-2 py-1 rounded-full",
                        isActive ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-600",
                      ].join(" ")}
                    >
                      {isActive ? "Selected" : "Tap"}
                    </span>
                  </div>
                  <div className={["mt-1 text-xs", isActive ? "text-white/80" : "text-neutral-500"].join(" ")}>
                    {s.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {active === "sat" ? (
          <div className="grid gap-4 lg:grid-cols-[1.6fr,0.9fr] items-start">
            {/* Inputs */}
            <Card>
              <CardHeader title="SAT Inputs" subtitle="Drag the slider or type exact correct answers." />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-800">Enter correct answers</div>
                    <span className="text-xs text-neutral-500">Module-based</span>
                  </div>

                  <div className="grid gap-3">
                    <SatModule
                      label="Reading & Writing Module 1"
                      max={27}
                      value={sat.verbal1}
                      onChange={(v) => setSat((p) => ({ ...p, verbal1: v }))}
                    />
                    <SatModule
                      label="Reading & Writing Module 2"
                      max={27}
                      value={sat.verbal2}
                      onChange={(v) => setSat((p) => ({ ...p, verbal2: v }))}
                    />
                    <SatModule
                      label="Math Module 1"
                      max={22}
                      value={sat.math1}
                      onChange={(v) => setSat((p) => ({ ...p, math1: v }))}
                    />
                    <SatModule
                      label="Math Module 2"
                      max={22}
                      value={sat.math2}
                      onChange={(v) => setSat((p) => ({ ...p, math2: v }))}
                    />
                  </div>

                  <div className="mt-2 rounded-xl border bg-white p-4">
                    <div className="text-sm font-semibold text-neutral-800">Quick stats</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <MiniStat label="R&W correct" value={`${satTotals.verbal}/54`} sub={`${satTotals.verbalPct}%`} />
                      <MiniStat label="Math correct" value={`${satTotals.math}/44`} sub={`${satTotals.mathPct}%`} />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Results */}
            <div className="lg:sticky lg:top-6 space-y-4">
              <Card>
                <CardHeader title="Results" subtitle="Based on your raw → scaled tables." />
                <CardBody>
                  <div className="grid gap-3">
                    <ResultCard label="Reading & Writing" value={satTotals.verbalScaled} tone="info" />
                    <ResultCard label="Math" value={satTotals.mathScaled} tone="info" />
                    <ResultCard label="Total SAT" value={satTotals.totalScaled} tone="warn" big />
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">
                    Official SAT uses equating; this uses your provided mapping.
                  </p>
                </CardBody>
              </Card>

              <Card>
                <div className="border-b px-5 py-4">
                  <div className="text-sm font-semibold text-neutral-900">Admission guide</div>
                  <div className="text-xs text-neutral-500">By total SAT score</div>
                </div>
                <div className="p-2">
                  <table className="w-full text-sm">
                    <tbody>
                      {satAdmissionBands.map((row) => (
                        <tr key={row.range} className="border-t first:border-t-0">
                          <td className="px-3 py-2 font-semibold text-sky-700 whitespace-nowrap">{row.range}</td>
                          <td className="px-3 py-2 text-neutral-700">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.6fr,0.9fr] items-start">
            {/* IELTS Inputs */}
            <Card>
              <CardHeader title="IELTS Inputs" subtitle="Enter band scores (0–9). Steps of 0.5." />
              <CardBody>
                <div className="grid gap-3 md:grid-cols-2">
                  <IeltsBand
                    label="Listening"
                    value={ielts.listening}
                    onChange={(v) => setIelts((p) => ({ ...p, listening: v }))}
                  />
                  <IeltsBand
                    label="Reading"
                    value={ielts.reading}
                    onChange={(v) => setIelts((p) => ({ ...p, reading: v }))}
                  />
                  <IeltsBand
                    label="Writing"
                    value={ielts.writing}
                    onChange={(v) => setIelts((p) => ({ ...p, writing: v }))}
                  />
                  <IeltsBand
                    label="Speaking"
                    value={ielts.speaking}
                    onChange={(v) => setIelts((p) => ({ ...p, speaking: v }))}
                  />
                </div>
              </CardBody>
            </Card>

            {/* IELTS Results */}
            <div className="lg:sticky lg:top-6 space-y-4">
              <Card>
                <CardHeader title="Results" subtitle="Average then rounded to nearest 0.5." />
                <CardBody>
                  <div className="grid gap-3">
                    <ResultCard label="Listening" value={ielts.listening} tone="info" />
                    <ResultCard label="Reading" value={ielts.reading} tone="info" />
                    <ResultCard label="Writing" value={ielts.writing} tone="info" />
                    <ResultCard label="Speaking" value={ielts.speaking} tone="info" />
                    <ResultCard
                      label="Overall Band"
                      value={ieltsOverall.overall}
                      tone="success"
                      big
                      subLabel={`${ieltsOverall.cefr.label} • ${ieltsOverall.cefr.desc}`}
                    />
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}

        <div className="text-xs text-neutral-500">
        </div>
      </div>

      {/* Slider styling (native but not ugly) */}
      <style jsx global>{`
        input[type="range"].sat-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(to right, #0284c7 var(--p, 0%), #e5e7eb var(--p, 0%));
          border: 1px solid #e5e7eb;
        }
        input[type="range"].sat-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: white;
          border: 2px solid #0284c7;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
          cursor: pointer;
        }
        input[type="range"].sat-range::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: white;
          border: 2px solid #0284c7;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
          cursor: pointer;
        }
        input[type="range"].sat-range::-moz-range-track {
          height: 10px;
          border-radius: 999px;
          background: transparent;
        }
        input[type="range"].sat-range:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}

/* ---------- UI primitives ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">{children}</div>;
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-neutral-900">{title}</div>
          {subtitle ? <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div> : null}
        </div>
        <span className="text-[11px] px-2 py-1 rounded-full bg-neutral-100 text-neutral-700">Calculator</span>
      </div>
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5">{children}</div>;
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-neutral-50 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-lg font-bold text-neutral-900">{value}</div>
        {sub ? <div className="text-xs font-semibold text-neutral-600">{sub}</div> : null}
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  tone,
  big,
  subLabel,
}: {
  label: string;
  value: number;
  tone: "info" | "warn" | "success";
  big?: boolean;
  subLabel?: string;
}) {
  const toneClasses = tone === "warn" ? "bg-amber-600" : tone === "success" ? "bg-emerald-600" : "bg-sky-600";

  return (
    <div className="rounded-xl border bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-800">{label}</div>
          {subLabel ? <div className="text-xs text-neutral-500 mt-1">{subLabel}</div> : null}
        </div>
        <div className={`shrink-0 ${toneClasses} text-white rounded-2xl px-4 py-2 font-bold`}>
          <span className={big ? "text-xl" : "text-base"}>{value}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Inputs ---------- */

function SatModule({
  label,
  max,
  value,
  onChange,
}: {
  label: string;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round((value / max) * 100);

  return (
    <div className="rounded-xl border bg-neutral-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-neutral-800">{label}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-white border text-neutral-700">
            {value}/{max}
          </span>
          <span className="text-xs text-neutral-500">{pct}%</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sat-range"
        style={{ ["--p" as any]: `${pct}%` }}
      />

      <div className="grid grid-cols-[1fr,120px] gap-2 items-center">
        <div className="text-xs text-neutral-500">Type exact</div>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value))))}
          className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
        />
      </div>
    </div>
  );
}

function IeltsBand({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const clampHalf = (v: number) => {
    const clamped = Math.min(9, Math.max(0, v));
    return Math.round(clamped * 2) / 2;
  };
  const pct = Math.round((value / 9) * 100);

  return (
    <div className="rounded-xl border bg-neutral-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-neutral-800">{label}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-white border text-neutral-700">{value.toFixed(1)}</span>
          <span className="text-xs text-neutral-500">{pct}%</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={9}
        step={0.5}
        value={value}
        onChange={(e) => onChange(clampHalf(Number(e.target.value)))}
        className="sat-range"
        style={{ ["--p" as any]: `${pct}%` }}
      />

      <div className="grid grid-cols-[1fr,120px] gap-2 items-center">
        <div className="text-xs text-neutral-500">Type exact</div>
        <input
          type="number"
          min={0}
          max={9}
          step={0.5}
          value={value}
          onChange={(e) => onChange(clampHalf(Number(e.target.value)))}
          className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
        />
      </div>
    </div>
  );
}

/* ---------- Logic / tables ---------- */

const satVerbalScale: Record<number, number> = {
  0: 200, 1: 200, 2: 200, 3: 200, 4: 200, 5: 200,
  6: 210, 7: 220, 8: 240, 9: 250, 10: 260, 11: 270,
  12: 300, 13: 330, 14: 350, 15: 360, 16: 380, 17: 380,
  18: 390, 19: 400, 20: 410, 21: 430, 22: 430, 23: 440,
  24: 450, 25: 270, 26: 470, 27: 480, 28: 490, 29: 500,
  30: 510, 31: 520, 32: 530, 33: 540, 34: 550, 35: 560,
  36: 570, 37: 580, 38: 590, 39: 600, 40: 610, 41: 620,
  42: 630, 43: 640, 44: 650, 45: 660, 46: 670, 47: 680,
  48: 700, 49: 710, 50: 720, 51: 730, 52: 760, 53: 780,
  54: 800,
};

const satMathScale: Record<number, number> = {
  0: 200, 1: 200, 2: 200, 3: 200, 4: 200, 5: 200,
  6: 210, 7: 240, 8: 270, 9: 300, 10: 310, 11: 330,
  12: 340, 13: 350, 14: 350, 15: 360, 16: 380, 17: 390,
  18: 390, 19: 400, 20: 420, 21: 440, 22: 450, 23: 460,
  24: 480, 25: 500, 26: 520, 27: 530, 28: 540, 29: 570,
  30: 580, 31: 590, 32: 600, 33: 620, 34: 640, 35: 650,
  36: 670, 37: 690, 38: 730, 39: 750, 40: 760, 41: 770,
  42: 780, 43: 790, 44: 800,
};

const scaleFallback = (raw: number, max: number) => Math.round((raw / max) * 800);
const roundHalf = (value: number) => Math.round(value * 2) / 2;

const satAdmissionBands = [
  { range: "1550–1600", note: "Ivy League & Top 1% Universities" },
  { range: "1450–1540", note: "Highly selective universities" },
  { range: "1400–1449", note: "Excellent universities" },
  { range: "1350–1399", note: "Strong public & private universities" },
  { range: "1300–1349", note: "Competitive universities" },
  { range: "1250–1299", note: "Quality state universities" },
  { range: "1200–1249", note: "Good universities" },
  { range: "1100–1199", note: "Accessible state & regional universities" },
  { range: "1000–1099", note: "Open admission universities" },
  { range: "Below 1000", note: "Community colleges & foundation programs" },
];

function ieltsToCefr(band: number) {
  if (band >= 8.0) return { label: "C2", desc: "Proficiency (Proficient user)" };
  if (band >= 7.0) return { label: "C1", desc: "Advanced (Proficient user)" };
  if (band >= 5.5) return { label: "B2", desc: "Upper intermediate (Independent user)" };
  if (band >= 4.0) return { label: "B1", desc: "Intermediate (Independent user)" };
  if (band >= 2.5) return { label: "A2", desc: "Elementary (Basic user)" };
  if (band >= 1.0) return { label: "A1", desc: "Beginner (Basic user)" };
  return { label: "Below A1", desc: "Pre-beginner" };
}
