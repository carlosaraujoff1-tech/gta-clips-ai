import type { Metadata } from "next";

import { ApprovalView } from "@/features/approval/approval-view";

export const metadata: Metadata = { title: "Aprovação" };

export default function Page() {
  return <ApprovalView />;
}
