import type { Metadata } from "next";

import { LivesView } from "@/features/lives/lives-view";

export const metadata: Metadata = { title: "Lives" };

export default function Page() {
  return <LivesView />;
}
