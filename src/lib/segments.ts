/**
 * Shared segmentation rules.
 *
 * The server-side extractor (src/lib/extractor.ts) and the browser widget
 * (public/widget.js) MUST split a page into exactly the same segments and
 * produce exactly the same "skeleton" string for each one, because the widget
 * looks translations up by the SHA-256 hash of that skeleton.
 *
 * If you change anything here, make the identical change in public/widget.js.
 *
 * Segment model
 * -------------
 * Inside every block-level container, consecutive text nodes and inline
 * elements form one "run" (one sentence-like unit). Inline elements inside a
 * run are replaced with numbered placeholder tags, e.g.
 *
 *   <p>Read our <a href="/privacy">privacy policy</a> today.</p>
 *   -> skeleton: "Read our <g1>privacy policy</g1> today."
 *
 * The translator keeps the <gN> tags, and the widget rebuilds the DOM from the
 * translated skeleton by re-using the original inline elements, so links and
 * formatting survive translation and the page structure is never discarded.
 */

/** Elements whose content is never translated and never descended into. */
export const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "svg", "math", "code", "pre",
  "iframe", "textarea", "select", "canvas", "video", "audio", "object", "head",
]);

/** Elements that flow inside a sentence. */
export const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "data", "dfn", "em", "font", "i",
  "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u",
  "label", "del", "ins",
]);

/** Elements that may sit inside a sentence but are kept untouched (opaque). */
export const ATOM_TAGS = new Set([
  "br", "wbr", "img", "svg", "code", "kbd", "samp", "var", "math", "script",
  "style", "noscript", "template", "picture", "input", "canvas",
]);

/** Attributes that carry user-visible text. */
export const TEXT_ATTRIBUTES = ["alt", "title", "placeholder", "aria-label"];

/** input[type] values whose `value` attribute is a visible label. */
export const VALUE_INPUT_TYPES = new Set(["button", "submit", "reset"]);

export function escapeSkeletonText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function unescapeSkeletonText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

export function normalizeSkeleton(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const PLACEHOLDER_RE = /<\/?g\d+>/g;

/** Plain, human-readable text of a skeleton (placeholders removed). */
export function skeletonToPlainText(skeleton: string): string {
  return normalizeSkeleton(unescapeSkeletonText(skeleton.replace(PLACEHOLDER_RE, " ")));
}

export function skeletonHasPlaceholders(skeleton: string): boolean {
  return /<g\d+>/.test(skeleton);
}

/** True when the text has at least two characters and at least one letter. */
export function isMeaningfulText(plain: string): boolean {
  return plain.length >= 2 && /\p{L}/u.test(plain);
}

/**
 * Checks that a translated skeleton kept every placeholder exactly once and
 * contains no other markup. Used to reject translations that would drop a link.
 */
export function placeholdersMatch(source: string, translated: string): boolean {
  const collect = (s: string) => {
    const tags = s.match(PLACEHOLDER_RE) || [];
    return tags.slice().sort().join(",");
  };
  if (collect(source) !== collect(translated)) return false;
  const stripped = translated.replace(PLACEHOLDER_RE, "");
  return !/<[a-z/!][^>]*>/i.test(stripped);
}
