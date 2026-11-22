import Image from "next/image";
import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { source } from "../../lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        url: "/",
        title: (
          <span className="flex items-center gap-2 font-semibold">
            <Image src="/icon.png" alt="" width={26} height={26} className="rounded-md" />
            UsageMax Docs
          </span>
        ),
      }}
      links={[{ text: "Open UsageMax", url: "https://usagemax.com/account", external: true }]}
      githubUrl="https://github.com/SYMBaiEX/usagemax"
    >
      {children}
    </DocsLayout>
  );
}
