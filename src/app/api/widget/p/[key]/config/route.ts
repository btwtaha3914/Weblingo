import { getWidgetConfig, handleWidgetGet, widgetJson } from "@/lib/widget-data";

export const dynamic = "force-dynamic";

/** Public widget bootstrap: languages with approved translations and their versions. */
export async function GET(request: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  return handleWidgetGet(request, key, 30, 0, (project) => getWidgetConfig(project));
}

export function OPTIONS() {
  return widgetJson(null, 204, { "Cache-Control": "public, max-age=86400" });
}
