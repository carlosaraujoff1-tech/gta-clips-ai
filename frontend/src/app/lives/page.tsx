import type { Metadata } from "next";

import { LivesView } from "@/features/library/library-views";

export const metadata: Metadata = { title: "Lives" };

export default function Page() {
  return <LivesView />;
}
