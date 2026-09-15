import type { AnchorHTMLAttributes } from "react";

type AuthNavigationProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: "/sign-in" | "/sign-up";
};

/**
 * Keep authentication entry as document navigation. Provider initiation also
 * uses plain anchors: RSC/prefetch must never follow an OAuth redirect.
 */
export function AuthNavigation({ href, ...props }: AuthNavigationProps) {
  return <a href={href} {...props} />;
}
