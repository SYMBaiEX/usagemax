import type { Metadata } from "next";

import { EnterpriseView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Enterprise observability",
  description: "A shared operating picture for teams running models, tools, and autonomous systems.",
};

export default function EnterprisePage() {
  return <EnterpriseView />;
}
