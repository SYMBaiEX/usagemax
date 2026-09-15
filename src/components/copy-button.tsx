"use client";

import { useEffect, useRef, useState } from "react";
import { CopyIcon } from "./icons";

export function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  async function copy() {
    clearTimeout(timeout.current);
    try { await navigator.clipboard.writeText(value); setStatus("Copied"); }
    catch { setStatus("Select the code below to copy"); }
    timeout.current = setTimeout(() => setStatus(""), 5000);
  }
  return <span className="copy-control"><button onClick={() => void copy()} type="button" aria-label="Copy code"><CopyIcon size={13} />Copy</button><span role="status">{status}</span></span>;
}
