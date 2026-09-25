"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} data-testid="print-sign">
      <Printer size={16} /> Print / Save as PDF
    </Button>
  );
}
