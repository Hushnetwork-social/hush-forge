import type { ReactNode } from "react";
import { PendingTxProvider } from "@/modules/forge/components/PendingTxProvider";

export default function TokensLayout({ children }: { children: ReactNode }) {
  return <PendingTxProvider>{children}</PendingTxProvider>;
}

