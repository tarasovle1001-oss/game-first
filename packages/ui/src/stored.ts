import { useState } from "react";

/** An on/off setting of the screen that is remembered between visits. Without storage it just lasts for this visit. */
export function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* no storage */
    }
  };
  return [value, set];
}
