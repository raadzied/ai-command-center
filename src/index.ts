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
  console.log('  /tool <action> <target> [content]  اختبار الأداة');
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
  }
}

main().catch((err) => {
  console.error('فشل بدء التطبيق:');
  console.error(err);
  process.exit(1);
});
