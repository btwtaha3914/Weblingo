import { getWidgetDictionary, handleWidgetGet, widgetJson, NO_STORE } from "@/lib/widget-data";
import { LANGUAGE_CODE_RE } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Approved translations for one language. The version segment comes from the
 * config endpoint and changes whenever a translation changes, so the response
 * can be cached for a long time without ever being stale.
 */
export async function GET(request: Request, ctx: { params: Promise<{ key: string; lang: string; version: string }> }) {
  const { key, lang } = await ctx.params;
  if (!LANGUAGE_CODE_RE.test(lang)) return widgetJson({ error: "Invalid language code." }, 400, NO_STORE);
  return handleWidgetGet(request, key, 86400, 300, (project) => getWidgetDictionary(project, lang));
}

export function OPTIONS() {
  return widgetJson(null, 204, { "Cache-Control": "public, max-age=86400" });
}
