import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { processInput } from './core/loop.js';
import { initDb, closeDb, getDb } from './memory/db.js';
import { logger as log } from './llm/logger.js';
import {
  readProjectFile,
  writeProjectFile,
  listProjectDirectory,
  projectFileExists,
} from './tools/filesystem.js';
import {
  isVoiceEnabled,
  toggleVoice,
  setVoiceEnabled,
  cancelSpeech,
} from './voice/state.js';
import { readRecentAudit } from './security/audit.js';
import { setApprovalStrategy } from './security/approval.js';
import { cliStrategy } from './security/cli-strategy.js';
import { speak } from './voice/tts.js';
import { AGENT_VOICES } from './voice/voices.js';

function printHeader(): void {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   AI Command Center — V1');
  console.log('   3 وكلاء: Mentor · Coder · Designer');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('اكتب طلبك بالعربية. أمثلة:');
  console.log('  • علّمني كيف تعمل الـ embeddings');
  console.log('  • اكتب دالة TypeScript تحسب المجموع');
  console.log('  • صمم واجهة صفحة تسجيل دخول');
  console.log('');
  console.log('الأوامر: /exit للخروج، /help للمساعدة');
  console.log('');
}

function printHelp(): void {
  console.log('');
  console.log('أوامر متاحة:');
  console.log('  /exit   إنهاء الجلسة');
  console.log('  /help   عرض هذه المساعدة');
  console.log('  /skills [استعلام]  عرض المهارات المحفوظة');
  console.log('  /audit          آخر 20 عملية موافقة/رفض');
  console.log('  /say <نص>       نطق نص عشوائي بصوت Khalid');
  console.log('  /tool <action> <target> [content]  اختبار الأداة');
  console.log('  /voice          تفعيل/تعطيل الصوت');
  console.log('  /voice status   عرض الحالة الحالية');
  console.log('');
  console.log('نصائح:');
  console.log('  • ابدأ بـ "علّمني" للتفعيل وكيل Mentor');
  console.log('  • ابدأ بـ "اكتب" للتفعيل وكيل Coder');
  console.log('  • ابدأ بـ "صمم" للتفعيل وكيل Designer');
  console.log('  • أي سؤال آخر يُعامل كدردشة عادية');
  console.log('');
}

function printSkills(query?: string): void {
  const db = getDb();
  const rows = query
    ? db
        .prepare(
          `SELECT id, name, category, proficiency, substr(content,1,120) AS preview
           FROM skills
           WHERE name LIKE ? OR content LIKE ?
           ORDER BY proficiency DESC, last_used DESC NULLS LAST
           LIMIT 20`,
        )
        .all(`%${query}%`, `%${query}%`)
    : db
        .prepare(
          `SELECT id, name, category, proficiency, substr(content,1,120) AS preview
           FROM skills
           ORDER BY proficiency DESC, last_used DESC NULLS LAST
           LIMIT 20`,
        )
        .all();

  if (rows.length === 0) {
    console.log('\nلا توجد مهارات محفوظة بعد.\n');
    return;
  }

  console.log('');
  console.log(`📚 ${rows.length} مهارة:`);
  for (const r of rows as Array<{
    id: number;
    name: string;
    category: string;
    proficiency: number;
    preview: string;
  }>) {
    console.log(`  • [${r.category}] ${r.name} (مستوى ${r.proficiency})`);
    console.log(`    ${r.preview}...`);
  }
  console.log('');
}

async function main(): Promise<void> {
  initDb();
  setApprovalStrategy(cliStrategy);
  log.info('Memory database initialized');
  printHeader();

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      let input: string;
      try {
        input = await rl.question('> ');
      } catch {
        break;
      }

      const trimmed = input.trim();
      if (!trimmed) continue;

      if (trimmed === '/exit' || trimmed === '/quit') {
        cancelSpeech();
        console.log('\nإلى اللقاء 👋\n');
        break;
      }

      if (trimmed === '/help') {
        printHelp();
        continue;
      }

      if (trimmed === '/skills' || trimmed.startsWith('/skills ')) {
        const query = trimmed.slice('/skills'.length).trim() || undefined;
        printSkills(query);
        continue;
      }

      if (trimmed === '/audit') {
        try {
          const records = readRecentAudit(20);
          if (records.length === 0) {
            console.log('\n📋 لا توجد عمليات مسجّلة بعد.\n');
          } else {
            console.log(`\n📋 آخر ${records.length} عملية:\n`);
            for (const r of records) {
              const ts = r.timestamp.slice(0, 19);
              console.log(`  [${r.risk}/${r.decision}] ${r.action_type} → ${r.target.slice(0, 40)} @ ${ts}`);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`\n❌ فشل قراءة سجل المراجعة: ${msg}\n`);
        }
        continue;
      }

      if (trimmed.startsWith('/say ')) {
        const text = trimmed.slice('/say '.length).trim();
        if (!text) { console.log('الاستخدام: /say <نص>'); continue; }
        console.log('🔊 جاري التوليد...');
        await speak(text, { agentName: null });
        console.log('✅ انتهى النطق');
        continue;
      }

      if (trimmed === '/voice' || trimmed.startsWith('/voice ')) {
        const sub = trimmed.slice('/voice'.length).trim();
        if (sub === 'status') {
          console.log(isVoiceEnabled() ? '🔊 الصوت مفعّل' : '🔇 الصوت معطّل');
          console.log('');
          console.log('الأصوات المعيّنة:');
          for (const [agent, voice] of Object.entries(AGENT_VOICES)) {
            console.log(`  • ${agent.padEnd(10)} → ${voice}`);
          }
          console.log('');
        } else if (sub === 'on') {
          setVoiceEnabled(true);
          console.log('🔊 الصوت مفعّل');
        } else if (sub === 'off') {
          setVoiceEnabled(false);
          console.log('🔇 الصوت معطّل');
        } else if (sub === '') {
          const enabled = toggleVoice();
          console.log(enabled ? '🔊 الصوت مفعّل' : '🔇 الصوت معطّل');
        } else {
          console.log('الاستخدام: /voice [on|off|status]');
        }
        continue;
      }
      if (trimmed.startsWith('/tool ')) {
        const [subcommand = '', target = '', ...tail] = trimmed.slice('/tool '.length).trim().split(' ');
        if (!subcommand || !target) {
          console.log('الاستخدام: /tool <read|write|list|exists> <path> [content]');
          continue;
        }
        try {
          if (subcommand === 'read') {
            const r = await readProjectFile(target);
            console.log(r.executed ? `\n${r.result}` : `\n❌ ${r.error}`);
          } else if (subcommand === 'write') {
            const r = await writeProjectFile(target, tail.join(' '));
            console.log(r.executed ? '✅ تمت الكتابة' : `❌ ${r.error}`);
          } else if (subcommand === 'list') {
            const r = await listProjectDirectory(target);
            console.log(r.executed ? `\n${(r.result ?? []).join('\n')}` : `❌ ${r.error}`);
          } else if (subcommand === 'exists') {
            const r = await projectFileExists(target);
            console.log(r.executed ? String(r.result) : `❌ ${r.error}`);
          } else {
            console.log(`أمر غير معروف: ${subcommand}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`\n❌ خطأ: ${msg}\n`);
        }
        continue;
      }

      try {
        const result = await processInput(trimmed);

        console.log('');
        console.log('─'.repeat(50));
        console.log(result.content);
        console.log('─'.repeat(50));
        const flag = result.content.startsWith('⚠️ [غير مُتحقق')
          ? '  ⚠️'
          : '';
        console.log(
          `[${result.agentUsed ?? 'chat'}] ${result.elapsedMs}ms${flag}`,
        );
        if (result.taskSummary && result.taskSummary.length > 0) {
          const failed = result.taskSummary.filter(
            (s) => s.status === 'failed',
          );
          if (failed.length > 0) {
            console.log('');
            console.log('📊 ملخص المهام:');
            for (const s of result.taskSummary) {
              const icon = s.status === 'done' ? '✅' : '❌';
              const info =
                s.status === 'done'
                  ? `${s.elapsedMs}ms`
                  : s.error ?? 'unknown';
              console.log(`  ${icon} ${s.id} (${s.agentName}): ${info}`);
            }
          }
        }
        console.log('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n❌ خطأ: ${msg}\n`);
        log.error('Loop error', { err: msg });
      }
    }
  } finally {
    rl.close();
    closeDb();
    // لا ننتظر الطابور — الخروج فوري
    log.info('Exiting — speech queue abandoned');
  }
}

main().catch((err) => {
  console.error('فشل بدء التطبيق:');
  console.error(err);
  process.exit(1);
});
