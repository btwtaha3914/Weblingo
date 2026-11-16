/*!
 * WebLingo website translation widget
 *
 * Install (in <head>):
 *   <script src="https://YOUR-WEBLINGO-DOMAIN/widget.js"
 *           data-project-key="wl_..."            (public project key, required)
 *           data-default-language="en"            (optional)
 *           data-languages="es,fr,ar,ur"          (optional filter)
 *           data-position="bottom-right"          (bottom-right|bottom-left|top-right|top-left)
 *           data-accent="#2563eb"                 (optional button colour)
 *           data-theme="auto"                     (auto|light|dark)
 *           defer></script>
 *
 * The project key is a public identifier (like a publishable key); it grants
 * read-only access to approved translations for the project's allowed domains.
 *
 * Segmentation rules MUST stay identical to src/lib/extractor.ts + segments.ts.
 */
(function () {
  "use strict";
  if (window.__weblingoLoaded) return;
  window.__weblingoLoaded = true;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------
  var script = document.currentScript;
  if (!script) {
    var all = document.querySelectorAll("script[data-project-key],script[data-project-id]");
    script = all[all.length - 1] || null;
  }
  if (!script) return;

  function attr(name, fallback) {
    var v = script.getAttribute(name);
    return v === null || v === "" ? fallback : v;
  }

  var projectKey = attr("data-project-key", attr("data-project-id", ""));
  if (!projectKey) {
    console.warn("[WebLingo] Missing data-project-key on the widget script tag.");
    return;
  }
  var apiBase = attr("data-api-url", "");
  if (!apiBase) {
    try { apiBase = new URL(script.src).origin; } catch (e) { apiBase = ""; }
  }
  apiBase = apiBase.replace(/\/+$/, "");
  var langFilter = attr("data-languages", "");
  var position = attr("data-position", "bottom-right");
  var accent = attr("data-accent", "#2563eb");
  var theme = attr("data-theme", "auto");
  var defaultLanguage = attr("data-default-language", "");
  var observeChanges = attr("data-observe", "true") !== "false";
  var reportMissing = attr("data-report-missing", "true") !== "false";
  var STORAGE_KEY = "weblingo:lang:" + projectKey;

  // ---------------------------------------------------------------------------
  // Segmentation (mirror of src/lib/segments.ts + extractor.ts)
  // ---------------------------------------------------------------------------
  function toSet(list) { var o = {}; for (var i = 0; i < list.length; i++) o[list[i]] = true; return o; }
  var SKIP_TAGS = toSet(["script", "style", "noscript", "template", "svg", "math", "code", "pre", "iframe", "textarea", "select", "canvas", "video", "audio", "object", "head"]);
  var INLINE_TAGS = toSet(["a", "abbr", "b", "bdi", "bdo", "cite", "data", "dfn", "em", "font", "i", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "label", "del", "ins"]);
  var ATOM_TAGS = toSet(["br", "wbr", "img", "svg", "code", "kbd", "samp", "var", "math", "script", "style", "noscript", "template", "picture", "input", "canvas"]);
  var TEXT_ATTRIBUTES = ["alt", "title", "placeholder", "aria-label"];
  var VALUE_INPUT_TYPES = toSet(["button", "submit", "reset"]);
  var ROOT_ID = "weblingo-root";

  var owned = new WeakSet();          // nodes WebLingo created or is currently holding translated
  var textRecords = new WeakMap();    // original text node -> record (in-place translation)

  function tagOf(el) { return (el.localName || el.nodeName || "").toLowerCase(); }

  function isNoTranslate(el) {
    var tr = el.getAttribute("translate");
    return el.hasAttribute("data-no-translate") || (tr && tr.toLowerCase() === "no") ||
      /(^|\s)notranslate(\s|$)/.test(el.getAttribute("class") || "");
  }

  function isExcluded(el) {
    var tag = tagOf(el);
    if (SKIP_TAGS[tag]) return true;
    if (el.id === ROOT_ID) return true;
    if (el.hasAttribute("hidden")) return true;
    if (isNoTranslate(el)) return true;
    if (tag === "input" && (el.getAttribute("type") || "").toLowerCase() === "hidden") return true;
    var style = (el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
    if (style.indexOf("display:none") !== -1 || style.indexOf("visibility:hidden") !== -1) return true;
    return false;
  }

  function classify(node) {
    if (node.nodeType === 3) return "text";
    if (node.nodeType !== 1) return "ignore";
    var tag = tagOf(node);
    if (INLINE_TAGS[tag] && isExcluded(node)) return "atom";
    if (ATOM_TAGS[tag]) return "atom";
    if (isExcluded(node)) return "skip";
    if (INLINE_TAGS[tag] && isInlineOnly(node)) return "inline";
    return "block";
  }

  function isInlineOnly(el) {
    var c = el.childNodes;
    for (var i = 0; i < c.length; i++) {
      var k = classify(c[i]);
      if (k === "block" || k === "skip") return false;
    }
    return true;
  }

  function escapeText(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function normalize(t) { return t.replace(/\s+/g, " ").replace(/^ | $/g, ""); }
  function unescapeText(t) {
    return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&amp;/g, "&");
  }
  var LETTER_RE;
  try { LETTER_RE = new RegExp("\\p{L}", "u"); } catch (e) { LETTER_RE = /[A-Za-zÀ-￿]/; }
  function plainOf(skel) { return normalize(unescapeText(skel.replace(/<\/?g\d+>/g, " "))); }
  function meaningful(plain) { return plain.length >= 2 && LETTER_RE.test(plain); }

  function buildSkeleton(nodes, counter, map) {
    var out = "";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var kind = classify(n);
      if (kind === "text") {
        out += escapeText(n.nodeValue || "");
      } else if (kind === "atom") {
        counter.n++;
        map[counter.n] = { el: n, atom: true };
        out += "<g" + counter.n + "></g" + counter.n + ">";
      } else if (kind === "inline") {
        counter.n++;
        var k = counter.n;
        map[k] = { el: n, atom: false };
        out += "<g" + k + ">" + buildSkeleton(n.childNodes, counter, map) + "</g" + k + ">";
      }
    }
    return out;
  }

  function containsOwned(nodes) {
    for (var i = 0; i < nodes.length; i++) if (owned.has(nodes[i])) return true;
    return false;
  }

  function flushRun(run, container, out) {
    if (!run.length || containsOwned(run)) return;
    var sig = [];
    for (var i = 0; i < run.length; i++) {
      var n = run[i];
      if (n.nodeType === 3 && !(n.nodeValue || "").trim()) continue;
      sig.push(n);
    }
    var hasText = false;
    for (var t = 0; t < sig.length; t++) if (sig[t].nodeType === 3) { hasText = true; break; }
    if (!hasText) {
      // No loose text, only inline elements (a nav of links...): one unit per element.
      for (var e = 0; e < sig.length; e++) if (classify(sig[e]) === "inline") processContainer(sig[e], out);
      return;
    }
    var map = {};
    var skeleton = normalize(buildSkeleton(run, { n: 0 }, map));
    if (!skeleton || skeleton.length > 5000 || !meaningful(plainOf(skeleton))) return;
    out.push({ kind: "run", container: container, nodes: run.slice(), skeleton: skeleton, map: map });
  }

  function processContainer(container, out) {
    if (owned.has(container)) return;
    var run = [];
    var children = container.childNodes;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var kind = classify(child);
      if (kind === "text" || kind === "inline" || kind === "atom") {
        run.push(child);
      } else if (kind !== "ignore") {
        flushRun(run, container, out);
        run = [];
        if (kind === "block") processContainer(child, out);
      }
    }
    flushRun(run, container, out);
  }

  function collectAttributes(root, out) {
    var children = root.children;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      var tag = tagOf(c);
      var excluded = isExcluded(c);
      if (!excluded || (!SKIP_TAGS[tag] && (tag === "img" || tag === "input") && !isNoTranslate(c))) {
        for (var a = 0; a < TEXT_ATTRIBUTES.length; a++) pushAttr(c, TEXT_ATTRIBUTES[a], out);
        if (tag === "input" && VALUE_INPUT_TYPES[(c.getAttribute("type") || "").toLowerCase()]) pushAttr(c, "value", out);
      }
      if (!excluded) collectAttributes(c, out);
    }
  }

  function pushAttr(el, name, out) {
    var rec = attrRecordOf(el, name);
    var v = rec ? rec.original : el.getAttribute(name);
    if (!v) return;
    var skel = normalize(escapeText(v));
    if (skel && meaningful(plainOf(skel))) out.push({ kind: "attr", el: el, name: name, skeleton: skel });
  }

  function collectSegments(root) {
    var out = [];
    processContainer(root, out);
    collectAttributes(root, out);
    return out;
  }

  // ---------------------------------------------------------------------------
  // SHA-256 (synchronous, so it also works on plain-http pages)
  // ---------------------------------------------------------------------------
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var hashCache = new Map();
  function sha256(str) {
    var cached = hashCache.get(str);
    if (cached) return cached;
    var bytes = new TextEncoder().encode(str);
    var len = bytes.length;
    var padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000), false);
    view.setUint32(padded.length - 4, (len * 8) >>> 0, false);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
      for (i = 16; i < 64; i++) {
        var x = W[i - 15], y = W[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var hex = "";
    for (var j = 0; j < 8; j++) hex += ("00000000" + H[j].toString(16)).slice(-8);
    if (hashCache.size > 5000) hashCache.clear();
    hashCache.set(str, hex);
    return hex;
  }

  // ---------------------------------------------------------------------------
  // Applying / restoring translations
  // ---------------------------------------------------------------------------
  var runRecords = [];     // structural replacements
  var attrRecords = [];    // { el, name, original, translated }
  var titleRecord = null;
  var docState = null;     // original <html dir/lang>
  var currentLang = null;  // null = original language
  var currentDict = null;
  var missing = {};        // skeletons seen without translation (for reporting)

  function attrRecordOf(el, name) {
    for (var i = 0; i < attrRecords.length; i++) {
      if (attrRecords[i].el === el && attrRecords[i].name === name) return attrRecords[i];
    }
    return null;
  }

  function leadingWs(s) { var m = /^\s+/.exec(s); return m ? m[0] : ""; }
  function trailingWs(s) { var m = /\s+$/.exec(s); return m ? m[0] : ""; }

  /** Turns a translated skeleton into DOM nodes, re-using the original inline elements. */
  function buildFromSkeleton(translated, map, savedChildren) {
    var frag = document.createDocumentFragment();
    var stack = [frag];
    var used = {};
    var re = /<(\/?)g(\d+)>|([^<]+)|(<)/g;
    var m;
    while ((m = re.exec(translated))) {
      var top = stack[stack.length - 1];
      if (m[3] !== undefined || m[4] !== undefined) {
        var t = document.createTextNode(unescapeText(m[3] !== undefined ? m[3] : "<"));
        owned.add(t);
        top.appendChild(t);
      } else {
        var k = m[2];
        var entry = map[k];
        if (!entry) continue;
        if (m[1] === "/") {
          if (!entry.atom && stack.length > 1 && stack[stack.length - 1] === entry.el) stack.pop();
          continue;
        }
        if (used[k]) continue;
        used[k] = true;
        if (entry.atom) {
          top.appendChild(entry.el);
        } else {
          var el = entry.el;
          savedChildren.push({ el: el, children: Array.prototype.slice.call(el.childNodes) });
          while (el.firstChild) el.removeChild(el.firstChild);
          owned.add(el);
          top.appendChild(el);
          stack.push(el);
        }
      }
    }
    return frag;
  }

  function applyRun(seg, translated) {
    var nodes = seg.nodes;
    var container = seg.container;
    if (!nodes.length || nodes[0].parentNode !== container) return;
    var firstText = "", lastText = "";
    for (var i = 0; i < nodes.length; i++) if (nodes[i].nodeType === 3) { firstText = nodes[i].nodeValue; break; }
    for (var j = nodes.length - 1; j >= 0; j--) if (nodes[j].nodeType === 3) { lastText = nodes[j].nodeValue; break; }
    var lead = nodes[0].nodeType === 3 ? leadingWs(firstText) : "";
    var trail = nodes[nodes.length - 1].nodeType === 3 ? trailingWs(lastText) : "";

    // Fast path: a single text node -> change it in place (keeps framework references).
    var textNodes = nodes.filter(function (n) { return n.nodeType === 3 && (n.nodeValue || "").trim(); });
    if (nodes.every(function (n) { return n.nodeType === 3; }) && textNodes.length === 1 && !/<g\d+>/.test(translated)) {
      var node = textNodes[0];
      var rec = { type: "text", node: node, original: node.nodeValue, translated: "" };
      rec.translated = leadingWs(node.nodeValue) + unescapeText(translated) + trailingWs(node.nodeValue);
      node.nodeValue = rec.translated;
      textRecords.set(node, rec);
      runRecords.push(rec);
      return;
    }

    var marker = document.createTextNode("");
    owned.add(marker);
    container.insertBefore(marker, nodes[0]);
    for (var r = 0; r < nodes.length; r++) if (nodes[r].parentNode === container) container.removeChild(nodes[r]);
    var saved = [];
    var frag = buildFromSkeleton(translated, seg.map, saved);
    if (lead) { var l = document.createTextNode(lead); owned.add(l); frag.insertBefore(l, frag.firstChild); }
    if (trail) { var tr = document.createTextNode(trail); owned.add(tr); frag.appendChild(tr); }
    var inserted = Array.prototype.slice.call(frag.childNodes);
    container.insertBefore(frag, marker);
    runRecords.push({ type: "run", container: container, marker: marker, originalNodes: nodes, inserted: inserted, saved: saved });
  }

  function restoreAll() {
    for (var i = runRecords.length - 1; i >= 0; i--) {
      var rec = runRecords[i];
      if (rec.type === "text") {
        if (rec.node.nodeValue === rec.translated) rec.node.nodeValue = rec.original;
        textRecords.delete(rec.node);
        continue;
      }
      var container = rec.marker.parentNode;
      for (var s = 0; s < rec.saved.length; s++) {
        var el = rec.saved[s].el;
        while (el.firstChild) el.removeChild(el.firstChild);
        for (var c = 0; c < rec.saved[s].children.length; c++) el.appendChild(rec.saved[s].children[c]);
        owned.delete(el);
      }
      if (!container) continue; // host page removed this content meanwhile
      for (var n = 0; n < rec.inserted.length; n++) {
        if (rec.inserted[n].parentNode === container) container.removeChild(rec.inserted[n]);
      }
      for (var o = 0; o < rec.originalNodes.length; o++) container.insertBefore(rec.originalNodes[o], rec.marker);
      container.removeChild(rec.marker);
    }
    runRecords = [];
    for (var a = 0; a < attrRecords.length; a++) {
      var ar = attrRecords[a];
      if (ar.el.getAttribute(ar.name) === ar.translated) ar.el.setAttribute(ar.name, ar.original);
    }
    attrRecords = [];
    if (titleRecord) {
      if (document.title === titleRecord.translated) document.title = titleRecord.original;
      titleRecord = null;
    }
    if (docState) {
      setOrRemove(document.documentElement, "dir", docState.dir);
      setOrRemove(document.documentElement, "lang", docState.lang);
    }
  }

  function setOrRemove(el, name, value) {
    if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
  }

  function translateRoot(root) {
    if (!currentDict) return;
    var segments = collectSegments(root);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var translated = currentDict[sha256(seg.skeleton)];
      if (!translated) { missing[seg.skeleton] = true; continue; }
      if (seg.kind === "attr") {
        var original = seg.el.getAttribute(seg.name);
        var value = unescapeText(translated);
        attrRecords.push({ el: seg.el, name: seg.name, original: original, translated: value });
        seg.el.setAttribute(seg.name, value);
      } else {
        applyRun(seg, translated);
      }
    }
  }

  function translateTitle() {
    var original = document.title;
    var skel = normalize(escapeText(original || ""));
    if (!skel) return;
    var t = currentDict[sha256(skel)];
    if (!t) { missing[skel] = true; return; }
    titleRecord = { original: original, translated: unescapeText(t) };
    document.title = titleRecord.translated;
  }

  // ---------------------------------------------------------------------------
  // MutationObserver (dynamic content) without feedback loops
  // ---------------------------------------------------------------------------
  var observer = null;
  var pendingRoots = new Set();
  var flushTimer = null;

  function paused(fn) {
    if (observer) observer.disconnect();
    try { fn(); } finally {
      if (observer && observeChanges && document.body) {
        observer.observe(document.body, {
          childList: true, subtree: true, characterData: true,
          attributes: true, attributeFilter: TEXT_ATTRIBUTES.concat(["value"])
        });
      }
    }
  }

  function blockAncestor(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.body && el.parentElement && INLINE_TAGS[tagOf(el)]) el = el.parentElement;
    return el;
  }

  function onMutations(list) {
    if (!currentDict) return;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === "characterData") {
        var rec = textRecords.get(m.target);
        if (rec && m.target.nodeValue === rec.translated) continue;
        if (rec) { // host changed a translated text node: adopt the new original
          rec.original = m.target.nodeValue;
          rec.translated = null;
          textRecords.delete(m.target);
        }
        if (owned.has(m.target)) continue;
      } else if (m.type === "attributes") {
        var ar = attrRecordOf(m.target, m.attributeName);
        if (ar && m.target.getAttribute(m.attributeName) === ar.translated) continue;
        if (ar) attrRecords.splice(attrRecords.indexOf(ar), 1);
      }
      var root = blockAncestor(m.target);
      if (root && !(root.closest && root.closest("#" + ROOT_ID))) pendingRoots.add(root);
    }
    if (pendingRoots.size && !flushTimer) {
      flushTimer = setTimeout(function () {
        flushTimer = null;
        var roots = Array.from(pendingRoots);
        pendingRoots.clear();
        paused(function () {
          for (var r = 0; r < roots.length; r++) if (roots[r].isConnected) translateRoot(roots[r]);
        });
        scheduleMissingReport();
      }, 120);
    }
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function getJSON(url) {
    return fetch(url, { credentials: "omit", mode: "cors" }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
        return data;
      });
    });
  }

  var dictCache = {};
  function languageVersion(lang) {
    var langs = (config && config.languages) || [];
    for (var i = 0; i < langs.length; i++) if (langs[i].code === lang) return langs[i].version || "0";
    return "0";
  }
  /**
   * Language and version are part of the URL path, so every language (and
   * every update) has its own cache entry at the CDN and in the browser.
   */
  function loadDictionary(lang) {
    var version = languageVersion(lang);
    var memKey = lang + "@" + version;
    if (dictCache[memKey]) return Promise.resolve(dictCache[memKey]);
    var cacheKey = "weblingo:dict:" + projectKey + ":" + memKey;
    try {
      var raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.targetLanguage === lang) { dictCache[memKey] = parsed; return Promise.resolve(parsed); }
      }
    } catch (e) { /* storage unavailable */ }
    var url = apiBase + "/api/widget/p/" + encodeURIComponent(projectKey) + "/t/" + encodeURIComponent(lang) + "/" + encodeURIComponent(version);
    return getJSON(url).then(function (data) {
      // Never apply a dictionary for a different language than requested.
      if (data.targetLanguage !== lang) throw new Error("Received translations for '" + data.targetLanguage + "' instead of '" + lang + "'");
      dictCache[memKey] = data;
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) { /* quota */ }
      return data;
    });
  }

  var reportTimer = null;
  var reported = {};
  function scheduleMissingReport() {
    if (!reportMissing || reportTimer) return;
    reportTimer = setTimeout(function () {
      reportTimer = null;
      var list = [];
      for (var s in missing) if (!reported[s] && list.length < 50) { list.push(s); reported[s] = true; }
      missing = {};
      if (!list.length) return;
      fetch(apiBase + "/api/widget/missing", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain" }, // simple request: no CORS preflight
        body: JSON.stringify({ key: projectKey, url: location.origin + location.pathname, strings: list })
      }).catch(function () { /* reporting is best-effort */ });
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Language switching
  // ---------------------------------------------------------------------------
  var config = null;

  var switchToken = 0;
  function setLanguage(lang) {
    if (!config) return Promise.resolve();
    var isSource = lang === config.sourceLanguage;
    if ((isSource && currentLang === null) || lang === currentLang) return Promise.resolve();
    var token = ++switchToken;
    ui.setBusy(true);
    var job = isSource ? Promise.resolve(null) : loadDictionary(lang);
    return job.then(function (data) {
      // A newer choice was made while this one was loading: ignore this one.
      if (token !== switchToken) return;
      paused(function () {
        restoreAll();
        currentDict = null;
        currentLang = null;
        if (!data) return;
        if (!docState) docState = { dir: document.documentElement.getAttribute("dir"), lang: document.documentElement.getAttribute("lang") };
        currentDict = data.dictionary || {};
        currentLang = lang;
        document.documentElement.setAttribute("lang", lang);
        document.documentElement.setAttribute("dir", data.isRtl ? "rtl" : "ltr");
        translateTitle();
        translateRoot(document.body);
      });
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage unavailable */ }
      ui.setCurrent(lang);
      ui.setError("");
      scheduleMissingReport();
    }).catch(function (err) {
      if (token !== switchToken) return;
      console.error("[WebLingo] Could not load translations:", err);
      ui.setError("Translation is unavailable right now.");
    }).then(function () { if (token === switchToken) ui.setBusy(false); });
  }

  // ---------------------------------------------------------------------------
  // Language switcher UI (Shadow DOM: isolated from the host page's CSS)
  // ---------------------------------------------------------------------------
  var ui = { setBusy: function () {}, setCurrent: function () {}, setError: function () {} };

  function safeColor(c) { return /^#[0-9a-f]{3,8}$|^rgb|^hsl|^[a-z]+$/i.test(c) ? c : "#2563eb"; }

  function buildUI(languages) {
    var host = document.createElement("div");
    host.id = ROOT_ID;
    host.setAttribute("translate", "no");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483000;" +
      (position.indexOf("top") === 0 ? "top:16px;" : "bottom:16px;") +
      (/left$/.test(position) ? "left:16px;" : "right:16px;");
    var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var up = position.indexOf("top") !== 0;
    var css =
      ":host{all:initial}" +
      "*{box-sizing:border-box;margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Noto Sans Arabic',sans-serif}" +
      ".wl{--accent:" + safeColor(accent) + ";--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--hover:#f1f5f9;position:relative;direction:ltr}" +
      (theme === "dark" ? ".wl{--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8;--line:#334155;--hover:#1e293b}" : "") +
      (theme === "auto" ? "@media (prefers-color-scheme:dark){.wl{--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8;--line:#334155;--hover:#1e293b}}" : "") +
      ".btn{display:flex;align-items:center;gap:8px;height:44px;padding:0 14px 0 12px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.18);transition:transform .15s ease,box-shadow .15s ease}" +
      ".btn:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(15,23,42,.24)}" +
      ".btn:focus-visible,.opt:focus-visible{outline:3px solid var(--accent);outline-offset:2px}" +
      ".dot{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--accent);color:#fff}" +
      ".chev{transition:transform .15s ease;color:var(--muted)}.open .chev{transform:rotate(180deg)}" +
      ".spin{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:s .8s linear infinite;display:none}.busy .spin{display:block}" +
      "@keyframes s{to{transform:rotate(360deg)}}" +
      ".menu{position:absolute;" + (up ? "bottom:52px;" : "top:52px;") + (/left$/.test(position) ? "left:0;" : "right:0;") +
      "min-width:230px;max-width:calc(100vw - 32px);max-height:min(60vh,420px);overflow:auto;padding:6px;border-radius:14px;border:1px solid var(--line);background:var(--bg);color:var(--fg);box-shadow:0 18px 40px rgba(15,23,42,.25);opacity:0;transform:translateY(" + (up ? "6px" : "-6px") + ");pointer-events:none;transition:opacity .15s ease,transform .15s ease}" +
      ".open .menu{opacity:1;transform:none;pointer-events:auto}" +
      ".opt{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:start;cursor:pointer;font-size:14px}" +
      ".opt:hover,.opt.active{background:var(--hover)}" +
      ".code{min-width:30px;padding:2px 6px;border-radius:6px;background:var(--hover);color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;text-align:center}" +
      ".names{display:flex;flex-direction:column;flex:1;min-width:0}.native{font-weight:600}.en{font-size:12px;color:var(--muted)}" +
      ".check{color:var(--accent);visibility:hidden}.opt[aria-selected=true] .check{visibility:visible}" +
      ".err{display:none;padding:8px 10px;font-size:12px;color:#b91c1c}.err.show{display:block}" +
      "@media (max-width:480px){.btn .label{display:none}.btn{padding:0 10px}}" +
      "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}";

    var wrap = document.createElement("div");
    wrap.className = "wl";
    wrap.innerHTML =
      '<style>' + css + '</style>' +
      '<button class="btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="wl-list">' +
      '<span class="dot" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg></span>' +
      '<span class="label"></span><span class="spin" aria-hidden="true"></span>' +
      '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      '</button>' +
      '<div class="menu" id="wl-list" role="listbox" tabindex="-1" aria-label="Choose language"></div>';
    shadow.appendChild(wrap);
    var button = wrap.querySelector(".btn");
    var label = wrap.querySelector(".label");
    var menu = wrap.querySelector(".menu");
    var err = document.createElement("div");
    err.className = "err";
    err.setAttribute("role", "status");
    var options = [];
    var active = 0;

    languages.forEach(function (l, idx) {
      var o = document.createElement("button");
      o.type = "button";
      o.className = "opt";
      o.id = "wl-opt-" + l.code;
      o.setAttribute("role", "option");
      o.setAttribute("aria-selected", "false");
      o.setAttribute("tabindex", "-1");
      o.setAttribute("lang", l.code);
      var code = document.createElement("span"); code.className = "code"; code.textContent = l.code;
      var names = document.createElement("span"); names.className = "names";
      var nat = document.createElement("span"); nat.className = "native"; nat.textContent = l.nativeName || l.name;
      nat.dir = l.rtl ? "rtl" : "ltr";
      var en = document.createElement("span"); en.className = "en"; en.textContent = l.name;
      names.appendChild(nat); if (l.nativeName && l.nativeName !== l.name) names.appendChild(en);
      var check = document.createElement("span"); check.className = "check"; check.textContent = "✓";
      o.appendChild(code); o.appendChild(names); o.appendChild(check);
      o.addEventListener("click", function () { choose(idx); });
      menu.appendChild(o);
      options.push({ el: o, lang: l });
    });
    menu.appendChild(err);

    function isOpen() { return wrap.classList.contains("open"); }
    function focusOption(i) {
      active = (i + options.length) % options.length;
      options.forEach(function (o, j) { o.el.classList.toggle("active", j === active); });
      menu.setAttribute("aria-activedescendant", options[active].el.id);
      options[active].el.focus();
    }
    function open() {
      wrap.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      var sel = 0;
      options.forEach(function (o, j) { if (o.el.getAttribute("aria-selected") === "true") sel = j; });
      focusOption(sel);
    }
    function close(refocus) {
      wrap.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      if (refocus) button.focus();
    }
    function choose(i) {
      close(true);
      setLanguage(options[i].lang.code);
    }

    button.addEventListener("click", function () { if (isOpen()) close(false); else open(); });
    button.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); focusOption(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); focusOption(active - 1); }
      else if (e.key === "Home") { e.preventDefault(); focusOption(0); }
      else if (e.key === "End") { e.preventDefault(); focusOption(options.length - 1); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") { close(false); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    });
    document.addEventListener("click", function (e) {
      if (isOpen() && e.composedPath().indexOf(host) === -1) close(false);
    }, true);

    ui.setCurrent = function (code) {
      var found = null;
      options.forEach(function (o) {
        var sel = o.lang.code === code;
        o.el.setAttribute("aria-selected", sel ? "true" : "false");
        if (sel) found = o.lang;
      });
      label.textContent = found ? (found.nativeName || found.name) : code.toUpperCase();
      button.setAttribute("aria-label", "Language: " + (found ? found.name : code) + ". Change language");
    };
    ui.setBusy = function (busy) { wrap.classList.toggle("busy", !!busy); button.setAttribute("aria-busy", busy ? "true" : "false"); };
    ui.setError = function (msg) { err.textContent = msg; err.classList.toggle("show", !!msg); if (msg) open(); };

    document.body.appendChild(host);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function start() {
    getJSON(apiBase + "/api/widget/p/" + encodeURIComponent(projectKey) + "/config")
      .then(function (cfg) {
        config = cfg;
        var langs = cfg.languages || [];
        if (langFilter) {
          var wanted = langFilter.split(",").map(function (s) { return s.trim().toLowerCase(); });
          langs = langs.filter(function (l) { return l.code === cfg.sourceLanguage || wanted.indexOf(l.code) !== -1; });
        }
        if (langs.length < 2) {
          console.info("[WebLingo] No approved translations yet for this project; the switcher is hidden.");
          return;
        }
        buildUI(langs);
        ui.setCurrent(cfg.sourceLanguage);
        if (observeChanges && window.MutationObserver) {
          observer = new MutationObserver(onMutations);
          paused(function () {});
        }
        var saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { saved = null; }
        var initial = saved || defaultLanguage;
        if (initial && initial !== cfg.sourceLanguage && langs.some(function (l) { return l.code === initial; })) {
          setLanguage(initial);
        }
      })
      .catch(function (err) {
        console.warn("[WebLingo] Widget disabled:", err && err.message ? err.message : err);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.WebLingo = {
    setLanguage: setLanguage,
    getLanguage: function () { return currentLang || (config && config.sourceLanguage); },
    _segments: function () { return collectSegments(document.body).map(function (s) { return s.skeleton; }); },
    _hash: sha256
  };
})();
