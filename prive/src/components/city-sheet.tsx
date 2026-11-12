"use client";

import { Check } from "lucide-react";

import { Sheet, cn } from "./ui";
import { CITIES } from "@/lib/config";

export function CitySheet({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: string; onChange: (c: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Localização">
      <ul className="pb-4">
        {Object.keys(CITIES).map((c) => (
          <li key={c}>
            <button
              onClick={() => {
                onChange(c);
                onClose();
              }}
              className={cn("flex w-full items-center justify-between border-b border-line py-4 text-left text-[15px]", value === c && "text-gold-2")}
            >
              <span>
                {c}
                <span className="block text-xs text-ink-3">{CITIES[c].join(" · ")}</span>
              </span>
              {value === c && <Check className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
