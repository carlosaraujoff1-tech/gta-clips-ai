import type { Metadata } from "next";

import { ClipsView } from "@/features/clips/clips-view";

export const metadata: Metadata = { title: "Clips" };

export default function Page() {
  return <ClipsView />;
}
