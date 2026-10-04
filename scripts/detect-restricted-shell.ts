import { execSync } from 'node:child_process';

// يكشف إن كان الأب cmd.exe (بيئة محجوبة)
function getParentName(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=$PID\\").ParentProcessId"',
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      const parentId = Number(out);
      if (!parentId) return null;
      const nameOut = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${parentId} -ErrorAction SilentlyContinue).ProcessName"`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      return nameOut || null;
    }
    return null;
  } catch {
    return null;
  }
}

function main(): void {
  const parent = getParentName();
  if (parent === 'cmd' || parent === 'cmd.exe') {
    console.error(
      '⚠️  RESTRICTED SHELL DETECTED: parent process is cmd.exe.',
    );
    console.error(
      '   File writes will fail with ENOENT/SQLITE_IOERR in this shell.',
    );
    console.error(
      '   Run tests via: node --import tsx <file> from PowerShell.',
    );
    process.exit(1);
  }
  console.log(`Shell OK (parent: ${parent ?? 'unknown'})`);
  process.exit(0);
}

main();