import type { AnchorHTMLAttributes } from "react";

type AuthNavigationProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: "/sign-in" | "/sign-up";
};

/**
 * AuthKit routes redirect to WorkOS. They must use a document navigation rather
 * than Next's RSC client navigation, which would fetch the cross-origin redirect.
 */
export function AuthNavigation({ href, ...props }: AuthNavigationProps) {
  return <a href={href} {...props} />;
}
