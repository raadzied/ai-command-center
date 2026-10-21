import 'dotenv/config';
import { speak } from '../src/voice/tts.js';

async function main(): Promise<void> {
  console.log('=== Hakim TTS — Voices Test ===\n');

  if (!process.env.HAKIM_API_KEY) {
    console.error('HAKIM_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('--- Mentor (khalid-msa) ---');
  await speak(
    'مرحباً. أنا المرشد، سأقودك خطوة بخطوة نحو إتقان هذا المجال.',
    { agentName: 'mentor' },
  );

  console.log('\n--- Designer (layan-saudi) ---');
  await speak(
    'أنا المصممة. سأبني لك نظام تصميم متكامل يناسب جمهورك العربي.',
    { agentName: 'designer' },
  );

  console.log('\n--- Coder (omar) ---');
  await speak(
    'أنا المبرمج. جاهز لكتابة الكود وتشغيل الاختبارات.',
    { agentName: 'coder' },
  );

  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('TTS test failed:', err);
  process.exit(1);
});
