import { useEffect, useState } from "react";

/**
 * "Ahora" que avanza cada `intervalMs` mientras `active` (Seguimiento a la
 * vista y app en primer plano). Inactivo, se queda quieto.
 */
export function useNowMs(active: boolean, intervalMs = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Al reactivarse, el primer tick (≤ intervalMs) lo pone al día.
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return nowMs;
}
