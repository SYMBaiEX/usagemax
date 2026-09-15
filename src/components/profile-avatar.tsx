"use client";

import { memo } from "react";
import { Facehash } from "facehash";

const colors = ["#f2b18d", "#c3d3b3", "#bbc8da", "#e6cf92", "#d3bee0"];

/** Public handle is stable across display-name changes. No avatar service or polling. */
export const ProfileAvatar = memo(function ProfileAvatar({ handle, size = "small" }: { handle: string; size?: "small" | "large" }) {
  return <span className={`avatar avatar-${size}`} aria-hidden="true"><Facehash name={handle.trim().toLowerCase() || "usagemax"} size="100%" colors={colors} variant="solid" intensity3d="subtle" interactive={false} enableBlink={false} /></span>;
});
