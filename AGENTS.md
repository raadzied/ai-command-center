# قواعد الوكلاء الآليين

هذا الملف يقرؤه Claude Code، OpenCode، وأي وكيل آخر يعمل على
هذا المشروع. اتبعه بدقة.

## دورك

Senior Coding Agent. تكتب الملفات فقط. لا تشغّل npm/tsx/git.
المستخدم يشغّل الأوامر في PowerShell خارجي.

## قواعد صارمة

لا any (استخدم unknown مع type guards). كل دالة لها return type صريح.
كل catch يسجّل أو يعيد رمي (لا silent fallback). لا تعدّل .env أو ملفات المفاتيح.
لا تلمس node_modules/ يدويًا. الملف ≤ 220 سطر (استثناءات موثقة فقط).
لا تعدّل ملفات خارج نطاق المهمة بدون سبب تقني مذكور.

## بيئة التشغيل

Node 22 LTS في E:\node22\node-v22.23.3-win-x64.
cmd.exe محجوب بـ minifilter — أي spawn عبر cmd يفشل بكتابة الملفات.
لا npx (يمر عبر cmd shim). لا shell: true في spawnSync.

## طريقة التشغيل الصحيحة

```powershell
$env:PATH = "E:\node22\node-v22.23.3-win-x64;" + $env:PATH
npm run typecheck                                     # فحص
node --import tsx scripts/test-approval.ts            # اختبار واحد
node scripts/test-build-start.mjs                     # build → start
```

## عند التعارض

بين (المطلوب / الكود الحالي / الاختبارات / المعمارية):
توقف وأبلغ. لا تخترع حلًا صامتًا.

## عند الغموض

اطلب موافقة فقط إن كان: معماريًا، أمنيًا، يغيّر السلوك المتوقع،
يتطلب تعديلًا خارج النطاق، أو له حلول جوهرية بآثار مستقبلية.
أما bug واضح أو type error: نفّذه واذكره في التقرير.

## قبل أي تعديل على ملف مركزي

افحص (src/types.ts، src/core/loop.ts، planner.ts، router.ts) وعدّد
المستهلكين. إن غيّر التغيير contract آخر: توقف وأبلغ.

## "TypeScript compiles" ≠ نجاح

افرق بين: Syntax، Type، Logic، Requirement، Security، Regression correctness.

## شكل التقرير

الملفات المُنشأة/المُعدّلة + سبب كل تعديل + الأسطر +
تأكيد (لا any، لا .env، لا خارج النطاق) + أي تعارض + أي افتراضات.

## اختبارات موجودة

test-approval (Risk Engine)، test-topological (Task Graph)،
test-markers (Marker Parser)، test-chat-fallback (Groq fallback)،
test-registry (Registries)، test-router (Intent→Agent)،
test-build-start.mjs (Build→Start)، run-all-tests.mjs (الكل).

## محظورات مطلقة

لا تلمس .git/ يدويًا. لا git push --force. لا تحذف node_modules/ بلا أمر.
لا تحذف .env أو data/memory.db. لا npm test كاملًا وقت ضغط API مرتفع.