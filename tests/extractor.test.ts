/**
 * Unit tests for extraction + segmentation rules (no network, no database).
 *   npm run test:extract
 */
import assert from "node:assert/strict";
import { extractTranslatableText } from "../src/lib/extractor";
import { placeholdersMatch, skeletonToPlainText } from "../src/lib/segments";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

const texts = (html: string) => extractTranslatableText(html, "https://site.test/").strings.map((s) => s.sourceText);

test("headings, paragraphs, lists, tables, buttons, footer", () => {
  const out = texts(`<body><h2>Our plans</h2><p>Simple pricing</p><ul><li>Fast setup</li></ul>
    <table><tr><th>Feature</th><td>Included</td></tr></table><button>Buy now</button><footer>All rights reserved</footer></body>`);
  for (const t of ["Our plans", "Simple pricing", "Fast setup", "Feature", "Included", "Buy now", "All rights reserved"]) {
    assert.ok(out.includes(t), `missing ${t}`);
  }
});

test("nested inline markup becomes one segment with placeholders", () => {
  const out = texts(`<p>Read our <a href="/p">privacy <b>policy</b></a> today.</p>`);
  assert.deepEqual(out, ["Read our <g1>privacy <g2>policy</g2></g1> today."]);
});

test("a nav of links gives one segment per link", () => {
  const out = texts(`<nav><a href="/">Home</a> <a href="/about">About us</a></nav>`);
  assert.deepEqual(out, ["Home", "About us"]);
});

test("attributes: alt, placeholder, title, aria-label, submit value", () => {
  const out = texts(`<img alt="Team photo"><input placeholder="Your email"><a title="Open menu" aria-label="Main menu" href="#">x</a><input type="submit" value="Send">`);
  for (const t of ["Team photo", "Your email", "Open menu", "Main menu", "Send"]) assert.ok(out.includes(t), `missing ${t}`);
});

test("excludes scripts, styles, comments, hidden, translate=no, notranslate, pre/code", () => {
  const out = texts(`<script>var secret = "Hello script";</script><style>.a{}</style><!-- Hello comment -->
    <p hidden>Hidden one</p><p style="display: none">Hidden two</p><p translate="no">Brand name</p>
    <p class="x notranslate">Keep this</p><pre>Some code</pre><p>Visible text</p>`);
  assert.deepEqual(out, ["Visible text"]);
});

test("comments do not split a sentence", () => {
  assert.deepEqual(texts(`<p>Hello <!-- x --> world</p>`), ["Hello world"]);
});

test("entities and unicode are decoded then escaped consistently", () => {
  const out = texts(`<p>Tom &amp; Jerry &lt;3 café 東京</p>`);
  assert.deepEqual(out, ["Tom &amp; Jerry &lt;3 café 東京"]);
  assert.equal(skeletonToPlainText(out[0]), "Tom & Jerry <3 café 東京");
});

test("duplicates are counted once", () => {
  const r = extractTranslatableText(`<p>Contact us</p><a href="#">Contact us</a><p>Contact us</p>`, "https://s.test/");
  assert.equal(r.stringCount, 1);
  assert.equal(r.strings[0].occurrences, 3);
});

test("numbers and symbols only are skipped", () => {
  assert.deepEqual(texts(`<p>12,345</p><p>$ 9.99</p><p>OK</p>`), ["OK"]);
});

test("malformed HTML does not throw", () => {
  const out = texts(`<div><p>Unclosed paragraph<div>Block <b>bold</div></p><li>item`);
  assert.ok(out.length > 0);
});

test("same-origin links are collected for site discovery", () => {
  const r = extractTranslatableText(`<a href="/about">About</a><a href="https://other.test/">x</a><a href="/file.pdf">pdf</a>`, "https://site.test/");
  assert.deepEqual(r.links, ["https://site.test/about"]);
});

test("placeholder validation rejects lost links and injected tags", () => {
  assert.ok(placeholdersMatch("Read <g1>this</g1>", "Lea <g1>esto</g1>"));
  assert.ok(!placeholdersMatch("Read <g1>this</g1>", "Lea esto"));
  assert.ok(!placeholdersMatch("Read <g1>this</g1>", "Lea <g1>esto</g1><script>x</script>"));
});

console.log(`\n${passed} test(s) passed`);
