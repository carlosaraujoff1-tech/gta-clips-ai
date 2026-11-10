import type { Metadata } from "next";

import { PublicationsView } from "@/features/library/library-views";

export const metadata: Metadata = { title: "Publicações" };

export default function Page() {
  return <PublicationsView />;
}
