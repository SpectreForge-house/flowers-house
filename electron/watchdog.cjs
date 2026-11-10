// watchdog.cjs - Monitors Electron process and kills port 5173 server when Electron exits
// Usage: node watchdog.cjs <electronPid>

const { execSync } = require('child_process');

const electronPid = parseInt(process.argv[2], 10);

if (isNaN(electronPid)) {
  console.error('Usage: node watchdog.cjs <electronPid>');
  process.exit(1);
}

function isAlive(pid) {
  try {
    const out = execSync(`tasklist /fi "PID eq ${pid}" /nh`, { stdio: 'pipe', encoding: 'utf8', windowsHide: true });
    return out.includes(String(pid));
  } catch {
    return false;
  }
}

function killProcessOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, {
      stdio: 'pipe', encoding: 'utf8', windowsHide: true
    });
    const lines = out.trim().split('\n').filter(l => l.trim());
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(pid) && pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
      } catch {}
    }
    return pids.size > 0;
  } catch {
    return false;
  }
}

let checkCount = 0;
const MAX_CHECKS = 300; // 10 minutes max

function check() {
  checkCount++;
  if (checkCount > MAX_CHECKS) {
    process.exit(0);
  }

  if (!isAlive(electronPid)) {
    killProcessOnPort(5173);
    try { require('fs').unlinkSync(require('path').join(__dirname, '..', '.server.pid')); } catch {}
    process.exit(0);
  }
}

setInterval(check, 2000);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
