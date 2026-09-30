import knowledge from "@/data/knowledge.json";

// Working days skip Saturdays and Sundays only. Bank holidays (and 2nd/4th Saturdays) are not
// modelled, so working-day deadlines here can be a day or two early, which errs on the safe side.
export function addDays(iso: string, days: number, working: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!working) {
    d.setUTCDate(d.getUTCDate() + days);
  } else {
    let left = days;
    while (left > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
  }
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export type Deadline = { id: string; due: string; label: { en: string; hi: string }; overdue: boolean };

export function deadlines(anchors: { transaction?: string; bank_report?: string }, today = todayIso()): Deadline[] {
  return knowledge.deadlines
    .flatMap((d) => {
      const from = anchors[d.from as keyof typeof anchors];
      if (!from) return [];
      const due = addDays(from, d.days, d.working_days);
      return [{ id: d.id, due, label: d.label, overdue: due < today }];
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function formatDate(iso: string, lang: "en" | "hi"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
