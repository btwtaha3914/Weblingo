import { db } from "./index";
import {
  users,
  projects,
  projectDomains,
  supportedLanguages,
  pages,
  sourceStrings,
  pageStrings,
  translations,
  installationTokens,
  auditEvents,
  usageStatistics,
} from "./schema";
import { hashPassword, hashSourceText } from "../lib/auth";
import { translateBatch } from "../lib/engine-manager";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  console.log("🌱 Starting WebLingo database seeding...");

  // 1. Seed Supported Languages
  const languagesList = [
    { code: "en", name: "English", nativeName: "English", isRtl: false, isInstalled: true },
    { code: "es", name: "Spanish", nativeName: "Español", isRtl: false, isInstalled: true },
    { code: "ar", name: "Arabic", nativeName: "العربية", isRtl: true, isInstalled: true },
    { code: "ur", name: "Urdu", nativeName: "اردو", isRtl: true, isInstalled: true },
    { code: "fr", name: "French", nativeName: "Français", isRtl: false, isInstalled: true },
    { code: "de", name: "German", nativeName: "Deutsch", isRtl: false, isInstalled: true },
    { code: "it", name: "Italian", nativeName: "Italiano", isRtl: false, isInstalled: false },
    { code: "pt", name: "Portuguese", nativeName: "Português", isRtl: false, isInstalled: false },
    { code: "ru", name: "Russian", nativeName: "Русский", isRtl: false, isInstalled: false },
    { code: "zh", name: "Chinese", nativeName: "中文", isRtl: false, isInstalled: false },
    { code: "ja", name: "Japanese", nativeName: "日本語", isRtl: false, isInstalled: false },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", isRtl: false, isInstalled: false },
    { code: "tr", name: "Turkish", nativeName: "Türkçe", isRtl: false, isInstalled: false },
    { code: "ko", name: "Korean", nativeName: "한국어", isRtl: false, isInstalled: false },
    { code: "nl", name: "Dutch", nativeName: "Nederlands", isRtl: false, isInstalled: false },
    { code: "pl", name: "Polish", nativeName: "Polski", isRtl: false, isInstalled: false },
    { code: "sv", name: "Swedish", nativeName: "Svenska", isRtl: false, isInstalled: false },
    { code: "he", name: "Hebrew", nativeName: "עברית", isRtl: true, isInstalled: false },
    { code: "fa", name: "Persian", nativeName: "فارسی", isRtl: true, isInstalled: false },
    { code: "bn", name: "Bengali", nativeName: "বাংলা", isRtl: false, isInstalled: false },
    { code: "th", name: "Thai", nativeName: "ไทย", isRtl: false, isInstalled: false },
    { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", isRtl: false, isInstalled: false },
    { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", isRtl: false, isInstalled: false },
    { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", isRtl: false, isInstalled: false },
    { code: "uk", name: "Ukrainian", nativeName: "Українська", isRtl: false, isInstalled: false },
    { code: "el", name: "Greek", nativeName: "Ελληνικά", isRtl: false, isInstalled: false },
    { code: "cs", name: "Czech", nativeName: "Čeština", isRtl: false, isInstalled: false },
    { code: "ro", name: "Romanian", nativeName: "Română", isRtl: false, isInstalled: false },
    { code: "hu", name: "Hungarian", nativeName: "Magyar", isRtl: false, isInstalled: false },
  ];

  for (const lang of languagesList) {
    await db
      .insert(supportedLanguages)
      .values(lang)
      .onConflictDoUpdate({ target: supportedLanguages.code, set: lang });
  }

  // 2. Seed Default User
  const demoEmail = "demo@weblingo.local";
  let existingUser = await db.query.users.findFirst({
    where: eq(users.email, demoEmail),
  });

  let userId: number;
  if (!existingUser) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: demoEmail,
        passwordHash: hashPassword("demo12345"),
        fullName: "Demo Administrator",
        role: "owner",
      })
      .returning();
    userId = newUser.id;
  } else {
    userId = existingUser.id;
  }

  // 3. Seed Demo Project
  const demoProjectApiKey = "wl_live_demo_key_77889900aabbccdd";
  const [demoProj] = await db
    .insert(projects)
    .values({
      userId,
      name: "Apex Global Technology",
      baseUrl: "https://demo.weblingo.local",
      sourceLanguage: "en",
      targetLanguages: ["es", "ar", "ur", "fr", "de"],
      isAutoPublish: true, // Auto-publish for immediate interactive demo responsiveness
      apiKey: demoProjectApiKey,
    })
    .onConflictDoUpdate({
      target: projects.apiKey,
      set: {
        name: "Apex Global Technology",
        baseUrl: "https://demo.weblingo.local",
        targetLanguages: ["es", "ar", "ur", "fr", "de"],
        isAutoPublish: true,
      },
    })
    .returning();

  const projectId = demoProj.id;

  // 4. Seed Domains
  const domainsToSeed = ["demo.weblingo.local", "localhost", "127.0.0.1"];
  for (const domain of domainsToSeed) {
    await db
      .insert(projectDomains)
      .values({
        projectId,
        domain,
        isVerified: true,
      })
      .onConflictDoNothing();
  }

  // 5. Seed Installation Token
  await db
    .insert(installationTokens)
    .values({
      projectId,
      token: "wl_tok_live_7a8b9c0d1e2f3g4h",
      domainWhitelist: domainsToSeed,
      isActive: true,
    })
    .onConflictDoNothing();

  // 6. Seed Demo Pages
  const pagesList = [
    { urlPath: "/", title: "Homepage", extractionStatus: "extracted", translationStatus: "translated", stringCount: 8 },
    { urlPath: "/about", title: "About Us", extractionStatus: "extracted", translationStatus: "partial", stringCount: 4 },
    { urlPath: "/services", title: "Services", extractionStatus: "extracted", translationStatus: "translated", stringCount: 3 },
    { urlPath: "/contact", title: "Contact Us", extractionStatus: "extracted", translationStatus: "translated", stringCount: 3 },
  ];

  const pageMap = new Map<string, number>();
  for (const p of pagesList) {
    const [pageRow] = await db
      .insert(pages)
      .values({
        projectId,
        urlPath: p.urlPath,
        title: p.title,
        extractionStatus: p.extractionStatus,
        translationStatus: p.translationStatus,
        stringCount: p.stringCount,
        lastExtractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pages.projectId, pages.urlPath],
        set: { title: p.title, extractionStatus: p.extractionStatus },
      })
      .returning();
    pageMap.set(p.urlPath, pageRow.id);
  }

  // 7. Seed Translatable Strings for the Client Website
  const sampleStrings = [
    { text: "Welcome to our website. We provide fast and reliable web translation.", hint: "h1" },
    { text: "Contact our support team for help.", hint: "button" },
    { text: "Read our privacy policy and terms of service.", hint: "footer-link" },
    { text: "Our mission is to break language barriers across the global web.", hint: "p" },
    { text: "Cloud Infrastructure and Localization Solutions", hint: "h2" },
    { text: "Get in touch with our engineers today.", hint: "h2" },
    { text: "Translate Website", hint: "button" },
    { text: "Save Changes", hint: "button" },
    { text: "Services", hint: "nav" },
    { text: "About Us", hint: "nav" },
    { text: "Pricing", hint: "nav" },
    { text: "Contact Us", hint: "nav" },
    { text: "Autonomous Translation", hint: "h3" },
    { text: "Full RTL Script Support", hint: "h3" },
    { text: "Review & Human Approval", hint: "h3" },
  ];

  const stringMap = new Map<string, number>();
  for (const s of sampleStrings) {
    const hash = hashSourceText(s.text);
    const [strRow] = await db
      .insert(sourceStrings)
      .values({
        projectId,
        contentHash: hash,
        sourceText: s.text,
        wordCount: s.text.split(/\s+/).length,
        contextHint: s.hint,
      })
      .onConflictDoUpdate({
        target: [sourceStrings.projectId, sourceStrings.contentHash],
        set: { contextHint: s.hint },
      })
      .returning();
    stringMap.set(s.text, strRow.id);
  }

  // 8. Link Strings to Pages
  const homePageId = pageMap.get("/");
  if (homePageId) {
    for (const s of sampleStrings) {
      const stringId = stringMap.get(s.text);
      if (stringId) {
        await db
          .insert(pageStrings)
          .values({
            pageId: homePageId,
            stringId,
            domSelector: s.hint,
            occurrenceIndex: 0,
          })
          .onConflictDoNothing();
      }
    }
  }

  // 9. Comprehensive Translations for Client Site Demo (Spanish, Arabic RTL, Urdu RTL)
  const translationsToSeed = [
    // Welcome
    { text: "Welcome to our website. We provide fast and reliable web translation.", lang: "es", trans: "Bienvenido a nuestro sitio web. Ofrecemos una traducción web rápida y fiable.", status: "approved" },
    { text: "Welcome to our website. We provide fast and reliable web translation.", lang: "ar", trans: "مرحبا بكم في موقعنا. نحن نقدم ترجمة موقع سريعة وموثوق بها.", status: "approved" },
    { text: "Welcome to our website. We provide fast and reliable web translation.", lang: "ur", trans: "ہماری ویب سائٹ پر خوش آمدید۔ ہم تیز رفتار اور قابل اعتماد ویب ترجمہ فراہم کرتے ہیں۔", status: "approved" },

    // Mission
    { text: "Our mission is to break language barriers across the global web.", lang: "es", trans: "Nuestra misión es romper las barreras lingüísticas en la web global.", status: "approved" },
    { text: "Our mission is to break language barriers across the global web.", lang: "ar", trans: "مهمتنا هي كسر الحواجز اللغوية عبر الويب العالمي.", status: "approved" },
    { text: "Our mission is to break language barriers across the global web.", lang: "ur", trans: "ہمارا مقصد عالمی ویب پر زبان کی رکاوٹوں کو توڑنا ہے۔", status: "approved" },

    // Support
    { text: "Contact our support team for help.", lang: "es", trans: "Póngase en contacto con nuestro equipo de soporte para obtener ayuda.", status: "approved" },
    { text: "Contact our support team for help.", lang: "ar", trans: "اتصل بفريق الدعم للمساعدة.", status: "approved" },
    { text: "Contact our support team for help.", lang: "ur", trans: "مدد کے لئے ہماری ٹیم سے رابطہ کریں.", status: "approved" },

    // Privacy
    { text: "Read our privacy policy and terms of service.", lang: "es", trans: "Lea nuestra política de privacidad y condiciones de servicio.", status: "approved" },
    { text: "Read our privacy policy and terms of service.", lang: "ar", trans: "اقرأي سياستنا الخاصة وشروط الخدمة.", status: "approved" },
    { text: "Read our privacy policy and terms of service.", lang: "ur", trans: "اپنی نجی پالیسی اور خدمت کی شرائط پڑھیں ۔", status: "approved" },

    // Cloud Solutions
    { text: "Cloud Infrastructure and Localization Solutions", lang: "es", trans: "Soluciones de localización e infraestructura en la nube", status: "approved" },
    { text: "Cloud Infrastructure and Localization Solutions", lang: "ar", trans: "البنية التحتية السحابية وحلول الترجمة المحلية", status: "approved" },
    { text: "Cloud Infrastructure and Localization Solutions", lang: "ur", trans: "کلاؤڈ انفراسٹرکچر اور لوکلائزیشن حل", status: "approved" },

    // Get in touch
    { text: "Get in touch with our engineers today.", lang: "es", trans: "Póngase en contacto con nuestros ingenieros hoy.", status: "approved" },
    { text: "Get in touch with our engineers today.", lang: "ar", trans: "تواصل مع مهندسينا اليوم.", status: "approved" },
    { text: "Get in touch with our engineers today.", lang: "ur", trans: "آج ہی ہمارے انجینئرز سے رابطہ کریں۔", status: "approved" },

    // UI Buttons & Nav
    { text: "Translate Website", lang: "es", trans: "Traducir sitio web", status: "approved" },
    { text: "Translate Website", lang: "ar", trans: "ترجمة الموقع", status: "approved" },
    { text: "Translate Website", lang: "ur", trans: "ویب سائٹ کا ترجمہ کریں", status: "approved" },

    { text: "Save Changes", lang: "es", trans: "Guardar cambios", status: "approved" },
    { text: "Save Changes", lang: "ar", trans: "حفظ التغييرات", status: "approved" },
    { text: "Save Changes", lang: "ur", trans: "تبدیلیاں محفوظ کریں", status: "approved" },

    { text: "Services", lang: "es", trans: "Servicios", status: "approved" },
    { text: "Services", lang: "ar", trans: "خدماتنا", status: "approved" },
    { text: "Services", lang: "ur", trans: "خدمات", status: "approved" },

    { text: "About Us", lang: "es", trans: "Sobre nosotros", status: "approved" },
    { text: "About Us", lang: "ar", trans: "من نحن", status: "approved" },
    { text: "About Us", lang: "ur", trans: "ہمارے بارے میں", status: "approved" },

    { text: "Pricing", lang: "es", trans: "Precios", status: "approved" },
    { text: "Pricing", lang: "ar", trans: "الأسعار", status: "approved" },
    { text: "Pricing", lang: "ur", trans: "قیمتیں", status: "approved" },

    { text: "Contact Us", lang: "es", trans: "Contáctenos", status: "approved" },
    { text: "Contact Us", lang: "ar", trans: "اتصل بنا", status: "approved" },
    { text: "Contact Us", lang: "ur", trans: "ہم سے رابطہ کریں", status: "approved" },

    { text: "Autonomous Translation", lang: "es", trans: "Traducción Autónoma", status: "approved" },
    { text: "Autonomous Translation", lang: "ar", trans: "ترجمة ذاتية ومستقلة", status: "approved" },
    { text: "Autonomous Translation", lang: "ur", trans: "خود مختار ترجمہ", status: "approved" },

    { text: "Full RTL Script Support", lang: "es", trans: "Soporte Completo para Scripts RTL", status: "approved" },
    { text: "Full RTL Script Support", lang: "ar", trans: "دعم كامل للخط من اليمين إلى اليسار", status: "approved" },
    { text: "Full RTL Script Support", lang: "ur", trans: "دائیں سے بائیں سکرپٹ کی مکمل معاونت", status: "approved" },

    { text: "Review & Human Approval", lang: "es", trans: "Revisión y Aprobación Humana", status: "approved" },
    { text: "Review & Human Approval", lang: "ar", trans: "مراجعة واعتماد بشري", status: "approved" },
    { text: "Review & Human Approval", lang: "ur", trans: "جائزہ اور انسانی توثیق", status: "approved" },
  ];

  for (const t of translationsToSeed) {
    const strId = stringMap.get(t.text);
    if (strId) {
      await db
        .insert(translations)
        .values({
          stringId: strId,
          targetLanguage: t.lang,
          translatedText: t.trans,
          status: t.status,
          modelVersion: "ct2-int8-1.0",
          isReviewed: t.status === "approved",
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [translations.stringId, translations.targetLanguage],
          set: {
            translatedText: t.trans,
            status: t.status,
            isReviewed: t.status === "approved",
          },
        });
    }
  }

  // 9b. Seed French & German translations via the open-source engine
  for (const lang of ["fr", "de"]) {
    const texts = sampleStrings.map((s) => s.text);
    const batch = await translateBatch({ source_lang: "en", target_lang: lang, texts });
    for (let i = 0; i < sampleStrings.length; i++) {
      const strId = stringMap.get(sampleStrings[i].text);
      const tr = batch.translations[i];
      if (strId && tr) {
        await db
          .insert(translations)
          .values({
            stringId: strId,
            targetLanguage: lang,
            translatedText: tr.translated,
            status: "approved",
            modelVersion: batch.model_version,
            isReviewed: true,
            reviewedBy: userId,
            reviewedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [translations.stringId, translations.targetLanguage],
            set: {
              translatedText: tr.translated,
              status: "approved",
              isReviewed: true,
            },
          });
      }
    }
  }

  // 10. Seed Initial Usage Statistics & Audit Event
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(usageStatistics)
    .values({
      projectId,
      date: today,
      pageViews: 284,
      translatedChars: 9140,
      widgetRequests: 142,
    })
    .onConflictDoNothing();

  await db
    .insert(auditEvents)
    .values({
      userId,
      projectId,
      eventType: "project_seeded",
      details: { message: "Seeded complete vocabulary for live client website simulation" },
      ipAddress: "127.0.0.1",
    })
    .onConflictDoNothing();

  console.log("🎉 Database seeding complete!");
}
