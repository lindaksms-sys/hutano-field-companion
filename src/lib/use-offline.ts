import { useEffect, useState } from "react";
import { getOfflineState, onOfflineState, type OfflineState } from "./pwa";

export function useOfflineState(): OfflineState {
  const [s, setS] = useState<OfflineState>({ kind: "checking" });
  useEffect(() => {
    setS(getOfflineState());
    return onOfflineState(setS);
  }, []);
  return s;
}
