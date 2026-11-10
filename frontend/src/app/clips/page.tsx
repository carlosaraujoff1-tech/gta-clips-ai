import type { Metadata } from "next";

import { ClipsView } from "@/features/library/library-views";

export const metadata: Metadata = { title: "Clips" };

export default function Page() {
  return <ClipsView />;
}
