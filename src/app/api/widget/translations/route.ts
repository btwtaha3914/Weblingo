import { getWidgetDictionary, handleWidgetGet, widgetJson, NO_STORE } from "@/lib/widget-data";
import { LANGUAGE_CODE_RE } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Legacy query-string form (?key=...&lang=...), kept for widget scripts cached
 * in visitors' browsers. Not edge-cached, because Netlify's CDN once served one
 * language for all languages here. New widgets use
 * /api/widget/p/{key}/t/{lang}/{version}.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";
  const lang = (searchParams.get("lang") || "").trim();
  if (!LANGUAGE_CODE_RE.test(lang)) return widgetJson({ error: "Missing or invalid 'lang'." }, 400, NO_STORE);
  return handleWidgetGet(request, key, 0, 0, (project) => getWidgetDictionary(project, lang));
}

export function OPTIONS() {
  return widgetJson(null, 204, { "Cache-Control": "public, max-age=86400" });
}
