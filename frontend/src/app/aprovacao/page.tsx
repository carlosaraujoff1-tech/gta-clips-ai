import type { Metadata } from "next";

import { ApprovalView } from "@/features/library/library-views";

export const metadata: Metadata = { title: "Aprovação" };

export default function Page() {
  return <ApprovalView />;
}
