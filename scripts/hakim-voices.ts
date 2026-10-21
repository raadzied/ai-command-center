import 'dotenv/config';

interface Voice {
  id: string;
  slug?: string;
  name?: string;
  language?: string;
  dialect?: string;
}

async function main(): Promise<void> {
  const key = process.env.HAKIM_API_KEY;
  if (!key) {
    console.error('HAKIM_API_KEY not set in .env');
    process.exit(1);
  }

  try {
    const res = await fetch('https://api.tryhakim.ai/v1/audio/voices', {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${await res.text()}`);
      process.exit(1);
    }

    const data = (await res.json()) as unknown;
    const voices: Voice[] = Array.isArray(data)
      ? (data as Voice[])
      : ((data as { data?: Voice[] }).data ?? []);

    console.log(`Total voices: ${voices.length}\n`);
    console.log('Arabic voices:');
    for (const v of voices) {
      const isArabic =
        (v.language ?? '').startsWith('ar') ||
        (v.dialect ?? '').length > 0 ||
        (v.slug ?? '').match(/(khaleeji|msa|egy|levant|maghrebi|iraqi)/i);
      if (isArabic) {
        console.log(`  id=${v.id}  slug=${v.slug ?? '-'}  name=${v.name ?? '-'}  lang=${v.language ?? '-'}  dialect=${v.dialect ?? '-'}`);
      }
    }
  } catch (err) {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
