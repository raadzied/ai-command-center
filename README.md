# AI Command Center

نظام تشغيل شخصي عربي للذكاء الاصطناعي. يستقبل أوامر بالعربية،
يحللها، يوزعها على وكلاء متخصصين، يراجع جودتها، ويحفظ ما تعلمه.

## الحالة الحالية

**V2.8** — نواة كاملة تعمل عبر CLI.

## المميزات

- **3 وكلاء** بشخصيات متمايزة: Mentor (تعليم)، Coder (كتابة كود)، Designer (تصميم)
- **Task Graph**: تفكيك الطلبات المركبة إلى مهام متسلسلة بتبعيات
- **ذاكرة دلالية**: SQLite + sqlite-vec، مع بحث متجهي
- **مهارات تلقائية**: استخراج الدروس من ردود Mentor وحفظها
- **Quality Gate**: مراجع مستقل يقيّم كل رد ويعيد المحاولة عند الفشل
- **Risk Engine**: تصنيف العمليات (safe/review/dangerous) مع allowlist
- **Filesystem Tools**: read/write/list/exists مع بوابة موافقة
- **Multi-model fallback**: Gemini ↔ Groq ↔ Qwen بلا انقطاع

## المتطلبات

- **Node.js 22 LTS** (مثبت في E:\node22)
- **مفاتيح API** (في .env):
  - `GEMINI_API_KEY` — من [aistudio.google.com](https://aistudio.google.com)
  - `GROQ_API_KEY` — من [console.groq.com](https://console.groq.com)

## الإعداد

```powershell
# 1) ضع المفاتيح في .env
Copy-Item .env.example .env
notepad .env

# 2) ثبّت الحزم
$env:PATH = "E:\node22\node-v22.23.3-win-x64;" + $env:PATH
npm install
```

## الاستخدام

```powershell
# التطوير (tsx مباشر)
npm run dev

# الإنتاج (بعد build)
npm run build
node dist/index.js
```

## الأوامر داخل التطبيق

`/exit` — خروج

`/help` — مساعدة

`/skills [بحث]` — عرض المهارات المحفوظة

`/tool <action> <path> [content]` — اختبار أدوات الملفات

## أمثلة

```text
> علّمني الفرق بين let و const في JavaScript
> اكتب دالة TypeScript تحسب مجموع مصفوفة مع الحالة الفارغة
> صمم نظام ألوان لتطبيق SaaS عربي
> علّمني ما هو REST API، ثم اكتب مثال TypeScript يستخدمه
```

## البنية

انظر ARCHITECTURE.md.

## التطوير

قواعد الوكلاء (OpenCode، Claude Code): انظر AGENTS.md

كل الاختبارات: npm test (يحتاج Node 22 وشبكة سليمة)

فحص سريع: npm run typecheck

## الترخيص

استخدام شخصي. غير مخصص للنشر العام بعد.