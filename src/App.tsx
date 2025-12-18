import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Edit Distance (Levenshtein) Visualizer
 * - DP grid with row/col labels
 * - Step through fill order (row-major)
 * - Shows chosen operation(s) for each cell
 * - Optional backtrace of one optimal path
 *
 * Drop into a React app. Tailwind classes are used for styling.
 */

type Op = "init" | "match" | "replace" | "insert" | "delete";

type CellExplain = {
  i: number;
  j: number;
  aChar?: string;
  bChar?: string;
  cost: number;
  candidates: {
    op: Op;
    from: [number, number] | null;
    value: number;
  }[];
  chosen: {
    op: Op;
    from: [number, number] | null;
    value: number;
  };
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function computeEditDistanceSteps(a: string, b: string) {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  const parent: (null | { i: number; j: number; op: Op })[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => null)
  );
  const steps: CellExplain[] = [];

  // init first row/col
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
    parent[i][0] = i === 0 ? null : { i: i - 1, j: 0, op: "delete" };
    if (i > 0) {
      steps.push({
        i,
        j: 0,
        aChar: a[i - 1],
        bChar: "∅",
        cost: dp[i][0],
        candidates: [{ op: "delete", from: [i - 1, 0], value: dp[i][0] }],
        chosen: { op: "delete", from: [i - 1, 0], value: dp[i][0] },
      });
    } else {
      steps.push({
        i,
        j: 0,
        aChar: "∅",
        bChar: "∅",
        cost: dp[i][0],
        candidates: [{ op: "init", from: null, value: 0 }],
        chosen: { op: "init", from: null, value: 0 },
      });
    }
  }

  for (let j = 1; j <= n; j++) {
    dp[0][j] = j;
    parent[0][j] = { i: 0, j: j - 1, op: "insert" };
    steps.push({
      i: 0,
      j,
      aChar: "∅",
      bChar: b[j - 1],
      cost: dp[0][j],
      candidates: [{ op: "insert", from: [0, j - 1], value: dp[0][j] }],
      chosen: { op: "insert", from: [0, j - 1], value: dp[0][j] },
    });
  }

  // fill
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      const rep = dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);

      const candidates = [
        { op: "delete" as const, from: [i - 1, j] as [number, number], value: del },
        { op: "insert" as const, from: [i, j - 1] as [number, number], value: ins },
        {
          op: (a[i - 1] === b[j - 1] ? "match" : "replace") as Op,
          from: [i - 1, j - 1] as [number, number],
          value: rep,
        },
      ];

      // choose min; deterministic tie-break: diagonal (match/replace) > delete > insert
      const minVal = Math.min(del, ins, rep);
      const diag = candidates[2];
      const delC = candidates[0];
      const insC = candidates[1];

      let chosen = diag.value === minVal ? diag : delC.value === minVal ? delC : insC;

      dp[i][j] = chosen.value;
      parent[i][j] = chosen.from ? { i: chosen.from[0], j: chosen.from[1], op: chosen.op } : null;

      steps.push({
        i,
        j,
        aChar: a[i - 1],
        bChar: b[j - 1],
        cost: dp[i][j],
        candidates,
        chosen,
      });
    }
  }

  return { dp, steps, parent };
}

function buildBacktrace(parent: (null | { i: number; j: number; op: Op })[][], m: number, n: number) {
  const path = new Set<string>();
  let i = m;
  let j = n;
  path.add(`${i},${j}`);
  while (true) {
    const p = parent[i]?.[j];
    if (!p) break;
    i = p.i;
    j = p.j;
    path.add(`${i},${j}`);
  }
  return path;
}

function opLabel(op: Op) {
  switch (op) {
    case "match":
      return "Match (0)";
    case "replace":
      return "Replace (1)";
    case "insert":
      return "Insert (1)";
    case "delete":
      return "Delete (1)";
    case "init":
      return "Init";
  }
}

function opBadgeClass(op: Op) {
  switch (op) {
    case "match":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "replace":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "insert":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "delete":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "init":
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function EditDistanceVisualizer() {
  const [a, setA] = useState("intention");
  const [b, setB] = useState("execution");

  const [showBacktrace, setShowBacktrace] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(350); // ms per step
  const [stepIdx, setStepIdx] = useState(0);

  const { dp, steps, parent } = useMemo(() => {
    const safeA = a ?? "";
    const safeB = b ?? "";
    return computeEditDistanceSteps(safeA, safeB);
  }, [a, b]);

  // total steps includes init cells too
  const maxStep = steps.length - 1;

  // clamp stepIdx when inputs change
  useEffect(() => {
    setStepIdx((s) => clamp(s, 0, maxStep));
    setPlaying(false);
  }, [maxStep]);

  // autoplay
  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= maxStep) return;
    const t = window.setTimeout(() => {
      setStepIdx((s) => clamp(s + 1, 0, maxStep));
    }, speed);
    return () => window.clearTimeout(t);
  }, [playing, speed, stepIdx, maxStep]);

  const cur = steps[stepIdx];
  const revealed = useMemo(() => {
    // which cells are already computed at this step
    const s = new Set<string>();
    for (let k = 0; k <= stepIdx; k++) s.add(`${steps[k].i},${steps[k].j}`);
    return s;
  }, [stepIdx, steps]);

  const backtrace = useMemo(() => {
    if (!showBacktrace) return new Set<string>();
    return buildBacktrace(parent, a.length, b.length);
  }, [parent, a.length, b.length, showBacktrace]);

  const distance = dp[a.length][b.length];

  const gridRef = useRef<HTMLDivElement | null>(null);

  // keep current cell in view
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const target = el.querySelector(`[data-cell='${cur.i},${cur.j}']`) as HTMLElement | null;
    if (!target) return;
    const r1 = el.getBoundingClientRect();
    const r2 = target.getBoundingClientRect();
    const pad = 40;
    const dx = r2.left - r1.left;
    const dy = r2.top - r1.top;
    if (dx < pad || dy < pad || r2.right > r1.right - pad || r2.bottom > r1.bottom - pad) {
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [cur.i, cur.j]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Edit Distance Visualizer</h1>
            <p className="text-sm md:text-base text-slate-600 max-w-3xl">
              Watch the Levenshtein DP table fill in real time. Step through each cell, see the candidate operations
              (insert / delete / replace / match), and optionally highlight one optimal backtrace.
            </p>
          </header>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600">String A (rows)</label>
                  <input
                    value={a}
                    onChange={(e) => setA(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="e.g. kitten"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600">String B (cols)</label>
                  <input
                    value={b}
                    onChange={(e) => setB(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="e.g. sitting"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded-xl px-3 py-2 text-sm font-medium border border-slate-200 bg-slate-900 text-white hover:bg-slate-800"
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setStepIdx((s) => clamp(s + 1, 0, maxStep));
                  }}
                  className="rounded-xl px-3 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
                >
                  Step
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setStepIdx(0);
                  }}
                  className="rounded-xl px-3 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
                >
                  Reset
                </button>
                <div className="ml-2 flex items-center gap-2">
                  <span className="text-xs text-slate-600">Speed</span>
                  <input
                    type="range"
                    min={80}
                    max={900}
                    step={10}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-40"
                  />
                  <span className="text-xs tabular-nums text-slate-600">{speed}ms</span>
                </div>
                <label className="ml-auto flex items-center gap-2 text-xs text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={showBacktrace}
                    onChange={(e) => setShowBacktrace(e.target.checked)}
                  />
                  Show optimal backtrace
                </label>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">Distance:</span> <span className="tabular-nums">{distance}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Step <span className="tabular-nums">{stepIdx}</span> / <span className="tabular-nums">{maxStep}</span>
                  </div>
                </div>
              </div>

              <div
                ref={gridRef}
                className="mt-4 overflow-auto rounded-2xl border border-slate-200 bg-slate-50"
                style={{ maxHeight: 520 }}
              >
                <div className="inline-block min-w-full p-3">
                  <DPGrid
                    a={a}
                    b={b}
                    dp={dp}
                    revealed={revealed}
                    current={[cur.i, cur.j]}
                    backtrace={backtrace}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Current Cell</h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${opBadgeClass(cur.chosen.op)}`}
                  title={cur.chosen.op}
                >
                  {opLabel(cur.chosen.op)}
                </span>
              </div>

              <div className="mt-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>
                    i, j: <span className="font-mono">({cur.i}, {cur.j})</span>
                  </span>
                  <span>
                    dp[i][j] = <span className="font-mono font-semibold">{cur.cost}</span>
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-600">A char (row)</div>
                    <div className="mt-1 font-mono text-base">{cur.aChar ?? "∅"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-600">B char (col)</div>
                    <div className="mt-1 font-mono text-base">{cur.bChar ?? "∅"}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-medium text-slate-600">Candidates</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {cur.candidates.map((c, idx) => {
                      const chosen = c.op === cur.chosen.op && c.value === cur.chosen.value;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border px-3 py-2 ${
                            chosen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {opLabel(c.op)}
                              {c.from ? (
                                <span className={`ml-2 text-xs ${chosen ? "text-white/80" : "text-slate-500"}`}>
                                  from ({c.from[0]}, {c.from[1]})
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono tabular-nums">{c.value}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-600">Rule</div>
                  <div className="mt-1 text-sm text-slate-700 leading-relaxed">
                    dp[i][j] = min(
                    <span className="font-mono"> dp[i-1][j] + 1</span> (delete),
                    <span className="font-mono"> dp[i][j-1] + 1</span> (insert),
                    <span className="font-mono"> dp[i-1][j-1] + cost</span> (match/replace)
                    )
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-semibold">Quick tips</h3>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 list-disc pl-5">
                  <li>Diagonal is match/replace; up is delete; left is insert.</li>
                  <li>Toggle “Show optimal backtrace” to highlight one optimal path.</li>
                  <li>Try small strings first (e.g. "kitten" → "sitting").</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="text-xs text-slate-500">
            Deterministic tie-break: diagonal &gt; delete &gt; insert (for consistent visualization).
          </footer>
        </div>
      </div>
    </div>
  );
}

function DPGrid({
  a,
  b,
  dp,
  revealed,
  current,
  backtrace,
}: {
  a: string;
  b: string;
  dp: number[][];
  revealed: Set<string>;
  current: [number, number];
  backtrace: Set<string>;
}) {
  const m = a.length;
  const n = b.length;

  const cellClass = (i: number, j: number) => {
    const key = `${i},${j}`;
    const isRevealed = revealed.has(key);
    const isCur = current[0] === i && current[1] === j;
    const isPath = backtrace.has(key);

    const base = "relative rounded-xl border text-center w-12 h-12 md:w-14 md:h-14 flex items-center justify-center";
    const hidden = "bg-white border-slate-200 text-slate-300";
    const shown = "bg-white border-slate-200 text-slate-800";
    const cur = "ring-2 ring-slate-900 border-slate-900";
    const path = "bg-slate-900/5";

    return [base, isRevealed ? shown : hidden, isPath ? path : "", isCur ? cur : ""].filter(Boolean).join(" ");
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: `80px repeat(${n + 1}, minmax(48px, 56px))` }}>
      {/* top-left corner */}
      <div className="sticky left-0 z-10 bg-slate-50" />

      {/* column headers */}
      {Array.from({ length: n + 1 }).map((_, j) => {
        const label = j === 0 ? "∅" : b[j - 1];
        return (
          <div key={`col-${j}`} className="sticky top-0 z-10 bg-slate-50">
            <div className="h-12 md:h-14 flex items-center justify-center">
              <span className="text-xs font-medium text-slate-600">
                {j === 0 ? "∅" : (
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-200 font-mono text-slate-800">
                    {label}
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}

      {/* rows */}
      {Array.from({ length: m + 1 }).map((_, i) => {
        const rowLabel = i === 0 ? "∅" : a[i - 1];
        return (
          <React.Fragment key={`row-${i}`}>
            {/* row header */}
            <div className="sticky left-0 z-10 bg-slate-50">
              <div className="h-12 md:h-14 flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10 text-right tabular-nums">{i}</span>
                <span className="text-xs font-medium text-slate-600">
                  {i === 0 ? "∅" : (
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-200 font-mono text-slate-800">
                      {rowLabel}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* cells */}
            {Array.from({ length: n + 1 }).map((_, j) => {
              const key = `${i},${j}`;
              const isRevealed = revealed.has(key);
              const isCur = current[0] === i && current[1] === j;
              const val = dp[i][j];

              const showArrows = isCur && i > 0 && j > 0;

              return (
                <div key={`cell-${i}-${j}`} data-cell={`${i},${j}`} className="p-1">
                  <div className={cellClass(i, j)}>
                    {/* arrows showing ALL tried operations */}
                    {showArrows && (
                      <>
                        {/* delete (from top) */}
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-rose-500 text-xs">↓</span>
                        {/* insert (from left) */}
                        <span className="absolute top-1/2 -left-2 -translate-y-1/2 text-sky-500 text-xs">→</span>
                        {/* match/replace (from diag) */}
                        <span className="absolute -top-2 -left-2 text-amber-500 text-xs">↘</span>
                      </>
                    )}

                    <AnimatePresence mode="wait">
                      {isRevealed ? (
                        <motion.span
                          key={`v-${val}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.12 }}
                          className={`font-mono text-sm md:text-base tabular-nums ${isCur ? "font-semibold" : ""}`}
                        >
                          {val}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="hidden"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="text-xs text-slate-300"
                        >
                          ·
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
