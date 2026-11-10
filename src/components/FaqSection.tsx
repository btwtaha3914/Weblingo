"use client";

import React, { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: "Is the installation script ever invalid or expired?",
      answer:
        "No, the script does not expire automatically. The script tag (`<script src='.../widget.js' data-project-key='YOUR_KEY'></script>`) remains valid as long as the project exists in your WebLingo database and the API key has not been deleted or rotated. It will only stop loading translations if: (1) You delete the project, (2) You enable Domain Whitelisting and load the script on an unauthorized domain, or (3) Your WebLingo server is offline. Even in those scenarios, the script fails safely and silently—it will never break your website, stop JavaScript from running, or affect page forms.",
    },
    {
      question: "How do I install WebLingo on my website?",
      answer:
        "Simply copy the generated 1-line script tag and paste it into the `<head>` or `<body>` of your website HTML (or through Google Tag Manager, WordPress, Webflow, or Shopify theme settings). Once loaded, the widget automatically injects a floating language selector into the bottom-right corner and translates your page elements in real-time.",
    },
    {
      question: "How does automatic translation and approval work?",
      answer:
        "When you enter a webpage URL in the WebLingo translator, our system fetches the page, detects all translatable headings, paragraphs, and buttons, and translates them into your target language. By default, translations are marked as 'Approved' immediately so they are live on your website widget with zero delay. You still retain full authority to edit any translated line at any time from your Project Library.",
    },
    {
      question: "Can I edit an auto-approved translation?",
      answer:
        "Yes, absolutely! On the homepage or within your Project page, scroll to the 'Translation Library & Strings' table. Click 'Edit' on any row, customize the phrasing, brand terminology, or grammar, and click 'Save & Approve'. The updated translation is instantly updated in the database and served to your website widget.",
    },
    {
      question: "Are translations really 100% free with zero paid API costs?",
      answer:
        "Yes. WebLingo is specifically built to eliminate recurring per-character fees from Google Cloud Translate, DeepL Pro, or AWS Translate. We use an open-source neural machine translation pipeline with built-in translation memory. You will never receive a bill or hit a paid API quota.",
    },
    {
      question: "How are Right-to-Left (RTL) languages like Arabic and Urdu supported?",
      answer:
        "When a visitor selects Arabic (`ar`) or Urdu (`ur`), the WebLingo widget automatically sets `dir='rtl'` on the document `<html>` tag, inverts text alignment, and ensures numbers and punctuation flow in proper grammatical direction without requiring you to build separate CSS stylesheets.",
    },
    {
      question: "Can I test the widget on my website before changing any code?",
      answer:
        "Yes! You can test it on ANY live webpage in 10 seconds using your browser's Developer Tools (F12 -> Console). Run the 1-line script injection command provided in the translator panel, and the widget will appear on that page immediately for instant verification.",
    },
  ];

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="space-y-6">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Frequently Asked Questions & User Guide
        </h2>
        <p className="text-sm text-slate-500">
          Everything you need to know about website translation, installation snippets, and RTL support.
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => toggle(idx)}
                className="w-full px-6 py-4.5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>{faq.question}</span>
                <span className={`text-slate-400 text-lg transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                  ⌄
                </span>
              </button>

              {isOpen && (
                <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
