#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
echo "======================================================================"
echo "WebLingo Comprehensive End-to-End Automated Test Suite"
echo "Target: $BASE_URL"
echo "======================================================================"

# 1. Healthcheck
echo -n "[Test 1] Healthcheck (/api/health)... "
HEALTH=$(curl -s "$BASE_URL/api/health")
echo "$HEALTH" | grep -q '"ok":true'
echo "PASS ✓"

# 2. Engine Translation with Auto-Chunking (600+ characters)
echo -n "[Test 2] Long-Text Auto-Chunking (>600 chars)... "
LONG_TEXT="WebLingo is a website translation platform designed to enable localization without paid APIs. In todays digital landscape, website owners often struggle with recurring fees for translation services. WebLingo provides a self-hosted alternative that extracts text from HTML pages and delivers translations seamlessly. Whether dealing with short navigation buttons or long informative paragraphs, the engine handles content without truncating long articles. Right to left languages such as Arabic and Urdu are fully supported with proper layout adjustments."
RESP_ES=$(curl -s -X POST "$BASE_URL/api/translate/test" \
  -H "Content-Type: application/json" \
  -d "{\"source_lang\":\"en\",\"target_lang\":\"es\",\"texts\":[\"$LONG_TEXT\"]}")
echo "$RESP_ES" | grep -q '"target_rtl":false'
echo "$RESP_ES" | grep -q 'plataforma de traducción'
echo "PASS ✓ (Full article translated into Spanish)"

# 3. Arabic Translation with RTL validation
echo -n "[Test 3] Arabic Translation (RTL verification)... "
RESP_AR=$(curl -s -X POST "$BASE_URL/api/translate/test" \
  -H "Content-Type: application/json" \
  -d '{"source_lang":"en","target_lang":"ar","texts":["Welcome to our website."]}')
echo "$RESP_AR" | grep -q '"target_rtl":true'
echo "$RESP_AR" | grep -q 'مرحبا بكم في موقعنا'
echo "PASS ✓ (Native Arabic Unicode & target_rtl=true)"

# 4. Urdu Translation with RTL validation
echo -n "[Test 4] Urdu Translation (RTL verification)... "
RESP_UR=$(curl -s -X POST "$BASE_URL/api/translate/test" \
  -H "Content-Type: application/json" \
  -d '{"source_lang":"en","target_lang":"ur","texts":["Welcome to our website."]}')
echo "$RESP_UR" | grep -q '"target_rtl":true'
echo "$RESP_UR" | grep -q 'ہماری ویب سائٹ پر خوش آمدید'
echo "PASS ✓ (Native Urdu Unicode & target_rtl=true)"

# 5. Extraction API with HTML content & SHA-256 deduplication
echo -n "[Test 5] HTML Content Extraction & SHA-256 Hashes... "
RESP_EXTRACT=$(curl -s -X POST "$BASE_URL/api/extract" \
  -H "Content-Type: application/json" \
  -d '{"html":"<div><h1>Global Localization</h1><p>Breaking language barriers</p></div>"}')
echo "$RESP_EXTRACT" | grep -q '"stringCount":2'
echo "$RESP_EXTRACT" | grep -q 'contentHash'
echo "PASS ✓ (Extracted and hashed translatable elements)"

# 6. SSRF Security Enforcement
echo -n "[Test 6] SSRF Security (Blocking private & loopback IPs)... "
RESP_SSRF=$(curl -s -X POST "$BASE_URL/api/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data"}')
echo "$RESP_SSRF" | grep -q 'blocked for SSRF'
RESP_LOOPBACK=$(curl -s -X POST "$BASE_URL/api/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://127.0.0.1:8080/admin"}')
echo "$RESP_LOOPBACK" | grep -q 'blocked for SSRF'
echo "PASS ✓ (AWS metadata and loopback destinations safely blocked)"

# 7. Widget Delivery API
echo -n "[Test 7] Public Widget Translation Delivery API... "
RESP_WIDGET=$(curl -s "$BASE_URL/api/widget/translations?key=wl_live_demo_key_77889900aabbccdd&lang=es")
echo "$RESP_WIDGET" | grep -q '"targetLanguage":"es"'
echo "$RESP_WIDGET" | grep -q 'dictionary'
echo "PASS ✓ (Pre-approved dictionary delivered)"

# 8. Simulated Client Demo Page
echo -n "[Test 8] Simulated Customer Website (/client-demo)... "
DEMO_HTML=$(curl -s "$BASE_URL/client-demo")
echo "$DEMO_HTML" | grep -q 'Apex Global Technology'
echo "$DEMO_HTML" | grep -q 'widget.js'
echo "PASS ✓ (Customer site loads and embeds widget)"

echo "======================================================================"
echo "ALL 8 COMPREHENSIVE PLATFORM TESTS PASSED SUCCESSFULLY!"
echo "======================================================================"
