# معمارية AI Command Center

## نظرة عامة

النظام يمر بأربع طبقات أساسية عند كل طلب:

```text
User Input (Arabic)
        ↓
┌────────────────────────┐
│ Intent Classification  │  ← Groq (متعدد الموديلات)
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│  Decomposition         │  ← Task Graph (1-5 مهام)
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│  Agent Execution       │  ← Mentor / Coder / Designer
│  + Quality Gate        │  ← مراجع مستقل
│  + Tool Markers        │  ← كتابة ملفات عبر البوابة
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│  Memory + Skills       │  ← SQLite + vec0
└────────────────────────┘
```

## الطبقات

### 1. src/types.ts — العقود

كل الأنواع المشتركة: Task، AgentResult، QualityResult،
ProposedAction، ApprovalResult.

### 2. src/llm/ — مزودو النماذج

classifier.cloud.ts — تصنيف + embeddings (Groq + Gemini)

chat.ts — محادثة عامة (Gemini flash/flash-lite → Groq)

logger.ts — سجل بسيط على stderr (لا pino)

### 3. src/memory/ — الذاكرة

schema.sql — الجداول + 3 جداول vec0

db.ts — singleton بـ WAL + foreign_keys

store.ts — حفظ (conversations/projects/decisions/skills)

retrieve.ts — بحث متجهي موحّد

### 4. src/agents/ — الوكلاء

registry.ts — سجل ديناميكي بـ capabilities + riskLevel

base.ts — interface Agent

mentor.ts / coder.ts / designer.ts

### 5. src/core/ — الحلقة

loop.ts — processInput (المدخل الرئيسي)

planner.ts — إنشاء Plan

decomposer.ts — تفكيك + topological sort

router.ts — intent → agentName

quality-gate.ts — مراجع مستقل

skills.ts — استخراج مهارات من ردود Mentor

memory.ts — بناء Context + حفظ المحادثات

### 6. src/security/ — الأمان

risk-engine.ts — تصنيف (safe/review/dangerous)

approval.ts — بوابة الموافقة (interactive + non-interactive)

audit.ts — سجل كامل في audit_log

### 7. src/tools/ — الأدوات

registry.ts — سجل الأدوات

filesystem.ts — read/write/list/exists

executor.ts — executeWithApproval

markers.ts — استخراج markers الكتابة من الردود

### 8. src/utils/json.ts — extractJson متوازن

## التدفق الكامل لطلب واحد

```text
processInput(trimmed)
  ├─ buildMemoryContext(trimmed)          ← embed + retrieve
  ├─ createPlan(trimmed, context)
  │   ├─ classify(trimmed)                ← Groq
  │   └─ decompose(trimmed)               ← Task Graph
  ├─ topologicalSort(plan.tasks)
  └─ for each task:
      ├─ selectAgent(task)                ← registry
      ├─ agent.execute(task, context)     ← chat + Gemini→Groq
      ├─ evaluateQuality({...})           ← chatGroq
      ├─ if REVIEW_ERROR && !required → break
      ├─ if FAIL → retry مرة واحدة
      ├─ processMarkers(output)           ← إن coder
      │   └─ writeProjectFile → executeWithApproval
      │       ├─ classifyAction           ← risk-engine
      │       ├─ requestApproval          ← interactive
      │       └─ writeAudit               ← audit_log
      ├─ extractAndSaveSkill (Mentor فقط)
      └─ saveToMemory                     ← embed + insert
```

## قرارات معمارية

### لماذا لا vitest؟

vitest 2.x/3.x/5.x تعلّق على Node 24 + Windows بسبب pino worker
threads. الحل: node:test المدمج + --test-force-exit.

### لماذا markers وليس function calling؟

function calling مُقيّد بـ Gemini. عند 429، النظام كامل يتوقف.
markers تعمل مع أي LLM، وتحفظ resilience.

### لماذا multi-model fallback؟

Groq يُرجع 400 عند rate limiting. بدون fallback لكل موديل،
النظام يتوقف. الحل: كل نموذج يعطي فرصة، failover تلقائي.

### لماذا Quality Gate منفصل عن Reviewer؟

Reviewer LLM يحكم على الشكل والمنطق

Risk Engine (حتمي) يحكم على العمليات

الطبقتان تعملان بالتوازي، لا بالتتابع

### لماذا allowlist في risk-engine؟

blacklist يفشل مع quoting/formatting variants. allowlist آمن.

## الاختبارات

node:test في src/llm/classifier.cloud.test.ts (mocks)

سكربتات scripts/test-*.ts لكل ميزة

scripts/run-all-tests.mjs يشغّل الكل

scripts/test-build-start.mjs يثبت build → start

## قيود بيئية

Node 22 LTS إلزامي (Node 24 يكسر الاختبارات)

cmd.exe محجوب بـ minifilter (استخدم PowerShell مباشر)

لا npx (يمر عبر cmd shim)

تشغيل مباشر: node --import tsx <file>