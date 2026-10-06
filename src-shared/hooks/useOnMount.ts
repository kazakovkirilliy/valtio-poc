import { useRef, useEffect, type EffectCallback } from "react";

export const useOnMount = (callback: EffectCallback) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      callback();
    }
  }, [callback]);
};
