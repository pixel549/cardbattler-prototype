const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'visual-smoke');
const HOST = '127.0.0.1';
const PORT = 4173;
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEFAULT_BROWSER_PATHS = [
  process.env.CARD_BATTLER_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureBuildOutput() {
  const entryPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(entryPath)) {
    throw new Error('Missing dist/index.html. Run `npm run build` first or use `npm run visual:capture`.');
  }
}

async function loadCaptureTargets() {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'src', 'playtest', 'visualScenes.js')).href;
  const module = await import(moduleUrl);
  return module.VISUAL_SCENE_CAPTURE_TARGETS || [];
}

function resolveBrowserPath() {
  for (const candidate of DEFAULT_BROWSER_PATHS) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Could not find Microsoft Edge. Set CARD_BATTLER_BROWSER to a Chromium-based browser executable.',
  );
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'No response received yet.';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok || response.status === 404) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }

  throw new Error(`Preview server never became ready at ${url}. Last error: ${lastError}`);
}

function pipeOutput(stream, prefix, target) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line) target.write(`[${prefix}] ${line}\n`);
    }
  });
}

function startPreviewServer() {
  const useShell = process.platform === 'win32';
  const previewCommand = useShell
    ? `${NPM_COMMAND} run preview -- --host ${HOST} --strictPort --port ${PORT}`
    : NPM_COMMAND;
  const previewArgs = useShell
    ? []
    : ['run', 'preview', '--', '--host', HOST, '--strictPort', '--port', String(PORT)];
  const child = spawn(
    previewCommand,
    previewArgs,
    {
      cwd: ROOT,
      env: { ...process.env },
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  pipeOutput(child.stdout, 'preview', process.stdout);
  pipeOutput(child.stderr, 'preview', process.stderr);

  return child;
}

function stopProcessTree(child) {
  if (!child?.pid) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
}

function runProcess(command, args, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: quiet ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';

    if (!quiet) {
      pipeOutput(child.stdout, path.basename(command), process.stdout);
    }
    pipeOutput(child.stderr, path.basename(command), process.stderr);

    if (quiet && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${path.basename(command)} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
  });
}

async function captureTarget(browserPath, baseUrl, target) {
  const screenshotPath = path.join(OUTPUT_DIR, target.fileName);
  const targetUrl = new URL(baseUrl);
  targetUrl.searchParams.set('scene', target.id);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbattler-visual-'));
  try {
    console.log(`Capturing ${target.label} -> ${target.fileName}`);
    await runProcess(
      browserPath,
      [
        `--user-data-dir=${profileDir}`,
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-features=Translate,MediaRouter',
        '--force-device-scale-factor=1',
        '--run-all-compositor-stages-before-draw',
        `--window-size=${target.viewport.width},${target.viewport.height}`,
        `--virtual-time-budget=${target.virtualTimeBudget ?? 5000}`,
        `--screenshot=${screenshotPath}`,
        targetUrl.toString(),
      ],
      { quiet: true },
    );
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  return {
    id: target.id,
    label: target.label,
    fileName: target.fileName,
    viewport: target.viewport,
    screenshotPath,
    url: targetUrl.toString(),
  };
}

async function main() {
  ensureBuildOutput();

  const targets = await loadCaptureTargets();
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('No visual scene capture targets were found.');
  }

  const browserPath = resolveBrowserPath();
  const baseUrl = `http://${HOST}:${PORT}/`;

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const previewServer = startPreviewServer();
  try {
    await waitForServer(baseUrl, 60000);
    const captures = [];
    for (const target of targets) {
      captures.push(await captureTarget(browserPath, baseUrl, target));
    }

    const manifest = {
      capturedAt: new Date().toISOString(),
      browserPath,
      baseUrl,
      outputDir: OUTPUT_DIR,
      captures,
    };

    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    console.log(`Captured ${captures.length} scene(s) into ${OUTPUT_DIR}`);
    console.log(`Manifest: ${manifestPath}`);
  } finally {
    stopProcessTree(previewServer);
    await sleep(1000);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
