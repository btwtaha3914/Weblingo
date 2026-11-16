import { getWidgetConfig, handleWidgetGet, widgetJson } from "@/lib/widget-data";

export const dynamic = "force-dynamic";

/**
 * Legacy query-string form (?key=...), kept for widget scripts cached in
 * visitors' browsers. New widgets use /api/widget/p/{key}/config.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") || "";
  return handleWidgetGet(request, key, 30, 0, (project) => getWidgetConfig(project));
}

export function OPTIONS() {
  return widgetJson(null, 204, { "Cache-Control": "public, max-age=86400" });
}
