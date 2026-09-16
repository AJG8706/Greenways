"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WalkSource } from "@/lib/walk/source";

/**
 * Demo/QA controls (admin Demo tab launches into this). English-only is fine:
 * this tray never reaches buyers — it renders only when ?demo= is present,
 * which only the admin Demo tab issues.
 */
export function DemoTray({
  source,
  scenarioKey,
}: {
  source: WalkSource;
  scenarioKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [autoWalk, setAutoWalk] = useState(true);
  const demo = source.demo;
  if (!demo) return null;

  return (
    <>
      <button
        type="button"
        className="hud-chip fixed right-3 top-16 z-50"
        style={{ background: "var(--gw-harvest-gold)", color: "var(--gw-pine-shadow)" }}
        onClick={() => setOpen((v) => !v)}
        data-testid="demo-tray-toggle"
      >
        <FlaskConical size={16} /> Demo · {scenarioKey}
      </button>
      {open ? (
        <div
          className="fixed right-3 top-28 z-50 rounded-3 p-4"
          style={{ background: "var(--gw-pine-2)", boxShadow: "var(--shadow-2)", width: 230 }}
          data-testid="demo-tray"
        >
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between">
              <strong>Demo &amp; QA</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <label className="check t-small">
              <input
                type="checkbox"
                checked={autoWalk}
                onChange={(e) => {
                  setAutoWalk(e.target.checked);
                  demo.setAutoWalk(e.target.checked);
                }}
              />
              Auto-walk to tracked corner
            </label>
            <Button size="sm" variant="secondary" onClick={demo.jumpToTarget} data-testid="demo-jump">
              Jump to arrival
            </Button>
            <Button size="sm" variant="secondary" onClick={demo.stepOutside} data-testid="demo-outside">
              Step outside line
            </Button>
            <Button size="sm" variant="secondary" onClick={demo.calibrate} data-testid="demo-calibrate">
              Calibrate compass
            </Button>
            <Button size="sm" variant="secondary" onClick={demo.reset} data-testid="demo-reset">
              Reset walk
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
