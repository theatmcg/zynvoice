import { setTimeout as sleep } from "node:timers/promises";

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Renders `value` into the digit layout of `template` (e.g. "$7,211.10"), zero-padded like an odometer.
 * The first `locked` digits show the template's final digits; the rest roll, and sometimes spin randomly.
 */
export function slotDigits(template: string, value: number, locked: number, spinChance: number): string {
  const finalDigits = [...template].filter((ch) => /\d/.test(ch));
  const decimals = template.includes(".") ? template.split(".")[1].replace(/\D.*$/, "").length : 0;
  const rolling = Math.round(Math.abs(value) * 10 ** decimals)
    .toString()
    .padStart(finalDigits.length, "0")
    .slice(-finalDigits.length);
  let i = 0;
  let out = "";
  for (const ch of template) {
    if (!/\d/.test(ch)) {
      out += ch;
      continue;
    }
    if (i < locked) out += finalDigits[i];
    else out += Math.random() < spinChance ? String(Math.floor(Math.random() * 10)) : rolling[i];
    i++;
  }
  return out;
}

export interface SlotFrame {
  /** Eased progress, for values that just count up. */
  eased: number;
  /** Formats a number into its final layout, rolling and locking digits left to right. */
  roll: (template: string, value: number) => string;
}

export function slotFrame(t: number): SlotFrame {
  const eased = easeOutCubic(t);
  const lockProgress = t >= 1 ? 1 : Math.max(0, Math.min(1, (t - 0.35) / 0.6));
  const spin = t >= 1 ? 0 : 0.35 * (1 - t);
  return {
    eased,
    roll: (template, value) => {
      const digits = [...template].filter((ch) => /\d/.test(ch)).length;
      return slotDigits(template, value * eased, Math.floor(lockProgress * digits), spin);
    },
  };
}

/** Redraws `frame(t)` in place for `durationMs`, ending on the t=1 frame. */
export async function animateInPlace(frame: (t: number) => string, durationMs = 1500, fps = 30): Promise<void> {
  const out = process.stdout;
  let prevLines = 0;
  const showCursor = () => out.write("\x1b[?25h");
  const onSigint = () => {
    showCursor();
    process.exit(130);
  };
  process.once("SIGINT", onSigint);
  out.write("\x1b[?25l");
  const start = performance.now();
  try {
    while (true) {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const lines = frame(t).split("\n");
      if (prevLines) out.write(`\x1b[${prevLines}F`);
      out.write(lines.map((l) => l + "\x1b[K").join("\n") + "\n");
      prevLines = lines.length;
      if (t >= 1) break;
      await sleep(1000 / fps);
    }
  } finally {
    showCursor();
    process.off("SIGINT", onSigint);
  }
}
