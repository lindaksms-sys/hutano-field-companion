import { useEffect, useState } from "react";
import { getAiState, onAiState, refreshAiState, type AiState } from "./ai-model";

export function useAiState(): AiState {
  const [s, setS] = useState<AiState>({ kind: "checking" });
  useEffect(() => {
    setS(getAiState());
    const off = onAiState(setS);
    void refreshAiState();
    return off;
  }, []);
  return s;
}
