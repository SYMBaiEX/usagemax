import { loader, type MetaData, type PageData, type Source } from "fumadocs-core/source";
import type { DocData } from "fumadocs-mdx/runtime/types";
import { docs } from "../.source/server";

type DocsSource = Source<{ pageData: PageData & DocData; metaData: MetaData }>;

export const source = loader<DocsSource>(docs.toFumadocsSource(), { baseUrl: "/" });
export const docsOrigin = "https://docs.usagemax.com";
