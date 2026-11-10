/**
 * WebLingo Lightweight Translation Widget (widget.js)
 * Zero external dependencies.
 *
 * Usage:
 * <script src="https://YOUR-DOMAIN/widget.js" data-project-key="YOUR_API_KEY"></script>
 */
(function () {
  "use strict";

  console.log("[WebLingo] Widget script starting...");

  // Find configuration from script tag
  var scriptTag = document.currentScript;
  if (!scriptTag) {
    // Fallback: find the script tag that loaded this file
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf("widget.js") !== -1) {
        scriptTag = scripts[i];
        break;
      }
    }
  }
  if (!scriptTag) {
    scriptTag = document.querySelector("script[data-project-key]");
  }

  var projectKey = scriptTag ? scriptTag.getAttribute("data-project-key") : null;

  // Resolve API base URL
  var apiBase = window.location.origin;
  if (scriptTag) {
    var explicit = scriptTag.getAttribute("data-api-url");
    if (explicit) {
      apiBase = explicit.replace(/\/$/, "");
    } else if (scriptTag.src) {
      try {
        apiBase = new URL(scriptTag.src).origin;
      } catch (e) {
        apiBase = window.location.origin;
      }
    }
  }

  if (!projectKey) {
    console.warn("[WebLingo] Missing data-project-key on widget script tag.");
    console.log("[WebLingo] scriptTag:", scriptTag);
    return;
  }

  console.log("[WebLingo] projectKey:", projectKey);
  console.log("[WebLingo] apiBase:", apiBase);

  // Language catalogue
  var ALL_LANGUAGES = [
    { code: "en", name: "English", rtl: false },
    { code: "es", name: "Español", rtl: false },
    { code: "fr", name: "Français", rtl: false },
    { code: "de", name: "Deutsch", rtl: false },
    { code: "it", name: "Italiano", rtl: false },
    { code: "pt", name: "Português", rtl: false },
    { code: "ar", name: "العربية", rtl: true },
    { code: "ur", name: "اردو", rtl: true },
    { code: "he", name: "עברית", rtl: true },
    { code: "fa", name: "فارسی", rtl: true },
    { code: "ru", name: "Русский", rtl: false },
    { code: "zh", name: "中文", rtl: false },
    { code: "ja", name: "日本語", rtl: false },
    { code: "ko", name: "한국어", rtl: false },
    { code: "hi", name: "हिन्दी", rtl: false },
    { code: "tr", name: "Türkçe", rtl: false },
    { code: "nl", name: "Nederlands", rtl: false },
    { code: "pl", name: "Polski", rtl: false },
    { code: "sv", name: "Svenska", rtl: false },
    { code: "bn", name: "বাংলা", rtl: false },
    { code: "th", name: "ไทย", rtl: false },
    { code: "vi", name: "Tiếng Việt", rtl: false },
    { code: "id", name: "Bahasa Indonesia", rtl: false },
    { code: "ms", name: "Bahasa Melayu", rtl: false },
    { code: "uk", name: "Українська", rtl: false },
    { code: "el", name: "Ελληνικά", rtl: false },
    { code: "cs", name: "Čeština", rtl: false },
    { code: "ro", name: "Română", rtl: false },
    { code: "hu", name: "Magyar", rtl: false },
  ];

  // Filter languages based on data-languages attribute
  var langFilter = scriptTag ? scriptTag.getAttribute("data-languages") : null;
  var LANGUAGES = ALL_LANGUAGES.slice();
  if (langFilter) {
    var codes = langFilter.split(",").map(function (s) { return s.trim().toLowerCase(); });
    LANGUAGES = ALL_LANGUAGES.filter(function (l) { return codes.indexOf(l.code) !== -1; });
  }
  // Always include English
  if (!LANGUAGES.some(function (l) { return l.code === "en"; })) {
    LANGUAGES.unshift(ALL_LANGUAGES[0]);
  }

  console.log("[WebLingo] Languages:", LANGUAGES.map(function (l) { return l.code; }).join(", "));

  var currentLang = "en";
  var originalNodes = new Map();

  function normalizeText(text) {
    return text.trim().replace(/\s+/g, " ");
  }

  // SHA-256 implementation
  function sha256(text) {
    // Use crypto.subtle if available (HTTPS or localhost)
    if (globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      });
    }
    // Fallback for HTTP non-localhost
    return Promise.resolve(sha256Fallback(text));
  }

  function sha256Fallback(str) {
    // Simple FNV-1a fallback (not SHA-256, but better than nothing)
    // Actually, we need SHA-256 to match the backend. Let's implement it.
    var bytes = new TextEncoder().encode(str);
    // Use a synchronous SHA-256 implementation
    return sha256Sync(bytes);
  }

  function sha256Sync(bytes) {
    // SHA-256 constants
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var msgLen = bytes.length;
    var bitLen = msgLen * 8;
    var paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
    var padded = new Uint8Array(paddedLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(paddedLen - 4, bitLen >>> 0, false);

    var W = new Uint32Array(64);
    for (var offset = 0; offset < paddedLen; offset += 64) {
      for (var i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
      for (var i = 16; i < 64; i++) {
        var s0 = (W[i-15] >>> 7) | (W[i-15] << 25);
        s0 ^= (W[i-15] >>> 18) | (W[i-15] << 14);
        s0 ^= W[i-15] >>> 3;
        var s1 = (W[i-2] >>> 17) | (W[i-2] << 15);
        s1 ^= (W[i-2] >>> 19) | (W[i-2] << 13);
        s1 ^= W[i-2] >>> 10;
        W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];

      for (var i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;

        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    return H.map(function (v) { return v.toString(16).padStart(8, "0"); }).join("");
  }

  // Create UI Switcher
  function injectWidgetUI() {
    try {
      var container = document.createElement("div");
      container.id = "weblingo-widget-container";
      container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999999;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:8px;background:#0f172a;color:#f8fafc;padding:6px 12px;border-radius:9999px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);border:1px solid #334155;";

      var icon = document.createElement("span");
      icon.textContent = "\uD83C\uDF10";
      icon.style.fontSize = "16px";

      var select = document.createElement("select");
      select.id = "weblingo-lang-select";
      select.style.cssText = "background:transparent;color:#f8fafc;border:none;font-size:13px;font-weight:600;cursor:pointer;outline:none;padding:4px 8px;";

      LANGUAGES.forEach(function (l) {
        var opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = l.name;
        opt.style.background = "#0f172a";
        select.appendChild(opt);
      });

      select.addEventListener("change", function (e) {
        applyLanguage(e.target.value);
      });

      var widgetStatus = document.createElement("span");
      widgetStatus.style.cssText = "display:none;position:absolute;right:0;bottom:calc(100%+8px);max-width:min(320px,calc(100vw-32px));padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;font-size:12px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,0.25);";
      widgetStatus.setAttribute("role", "status");
      widgetStatus.setAttribute("aria-live", "polite");

      container.appendChild(icon);
      container.appendChild(select);
      container.appendChild(widgetStatus);
      document.body.appendChild(container);

      console.log("[WebLingo] Widget UI injected successfully");
    } catch (err) {
      console.error("[WebLingo] Failed to inject UI:", err);
    }
  }

  // Apply translations
  async function applyLanguage(targetLang) {
    if (targetLang === currentLang) return;

    if (targetLang === "en") {
      originalNodes.forEach(function (origText, node) {
        node.nodeValue = origText;
      });
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
      currentLang = "en";
      return;
    }

    try {
      var url = apiBase + "/api/widget/translations?key=" + encodeURIComponent(projectKey) + "&lang=" + encodeURIComponent(targetLang);
      var res = await fetch(url, { cache: "no-store" });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
      var dictionary = data.dictionary || {};
      if (Object.keys(dictionary).length === 0) {
        console.warn("[WebLingo] No translations available for " + targetLang);
        return;
      }

      var isRtl = Boolean(data.isRtl);
      document.documentElement.dir = isRtl ? "rtl" : "ltr";
      document.documentElement.lang = targetLang;

      // Scan text nodes
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName.toLowerCase();
          if (["script", "style", "noscript", "svg", "code", "pre"].indexOf(tag) !== -1) return NodeFilter.FILTER_REJECT;
          if (parent.closest("#weblingo-widget-container")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      var nodesToTranslate = [];
      var currentNode;
      while ((currentNode = walker.nextNode())) {
        nodesToTranslate.push(currentNode);
      }

      var translatedNodes = 0;
      for (var i = 0; i < nodesToTranslate.length; i++) {
        var node = nodesToTranslate[i];
        var raw = node.nodeValue;
        var norm = normalizeText(raw);
        if (!norm) continue;

        if (!originalNodes.has(node)) {
          originalNodes.set(node, raw);
        }

        var hash = await sha256(norm);
        if (dictionary[hash]) {
          node.nodeValue = dictionary[hash];
          translatedNodes++;
        }
      }

      currentLang = targetLang;
      console.log("[WebLingo] Translated " + translatedNodes + " text items to " + targetLang);
    } catch (err) {
      console.error("[WebLingo] Widget error:", err);
    }
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectWidgetUI);
  } else {
    injectWidgetUI();
  }

  // Expose applyLanguage globally for debugging
  window.__weblingo = { applyLanguage: applyLanguage, LANGUAGES: LANGUAGES };

  console.log("[WebLingo] Widget initialized. Use window.__weblingo.applyLanguage('es') to test.");
})();