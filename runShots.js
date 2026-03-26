const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const {
  makeShot,
  MAX_SEGMENTS_PER_PAGE,
  MAX_COPIES_PER_SEGMENT,
  DEFAULT_CDP_ENDPOINT,
} = require('./src/makeShot');

const DEFAULT_OUT_DIR = path.join(process.cwd(), 'screenshots');
const DEFAULT_URL_FILE = path.join(process.cwd(), 'urls.txt');

function parseArgs(argv) {
  const options = {
    urlsFile: DEFAULT_URL_FILE,
    outDir: DEFAULT_OUT_DIR,
    shotsPerDevice: 10,
    copiesPerScreen: 10,
    headless: false,
    proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    openAfterEach: false,
    viewerExecutable: process.platform === 'win32' ? 'chrome.exe' : 'google-chrome',
    cdpEndpoint: process.env.PLAYWRIGHT_CDP_ENDPOINT || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--urls':
        options.urlsFile = path.resolve(argv[++i]);
        break;
      case '--out':
        options.outDir = path.resolve(argv[++i]);
        break;
      case '--shots':
        options.shotsPerDevice = Number.parseInt(argv[++i], 10) || options.shotsPerDevice;
        break;
      case '--copies-per-screen':
        options.copiesPerScreen = Number.parseInt(argv[++i], 10) || options.copiesPerScreen;
        break;
      case '--proxy':
        options.proxy = argv[++i];
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--channel':
        options.channel = argv[++i];
        break;
      case '--open':
        options.openAfterEach = true;
        break;
      case '--viewer':
        options.viewerExecutable = argv[++i];
        break;
      case '--cdp':
        options.cdpEndpoint = argv[++i];
        break;
      case '--reuse-chrome': {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          options.cdpEndpoint = next;
          i += 1;
        } else {
          options.cdpEndpoint = DEFAULT_CDP_ENDPOINT;
        }
        break;
      }
      default:
        console.warn(`Unknown option "${arg}" will be ignored`);
    }
  }

  options.shotsPerDevice = Math.min(
    Math.max(1, options.shotsPerDevice),
    MAX_SEGMENTS_PER_PAGE,
  );
  options.copiesPerScreen = Math.min(
    Math.max(1, options.copiesPerScreen),
    MAX_COPIES_PER_SEGMENT,
  );

  return options;
}

async function readUrls(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function openInChrome(targetPath, executable) {
  if (!targetPath) {
    return;
  }
  const resolved = path.resolve(targetPath);
  if (process.platform === 'win32') {
    const escapedExe = executable.replace(/'/g, "''");
    const escapedTarget = resolved.replace(/'/g, "''");
    const command = `Start-Process -FilePath '${escapedExe}' -ArgumentList @('${escapedTarget}')`;
    const child = spawn('powershell.exe', ['-NoLogo', '-Command', command], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } else {
    const child = spawn(executable, [resolved], { detached: true, stdio: 'ignore' });
    child.unref();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.cdpEndpoint && options.proxy) {
    console.warn('Proxy cannot be applied when reusing an existing Chrome via CDP. Proxy will be ignored.');
  }

  await ensureDir(options.outDir);
  const batchStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const batchDir = path.join(options.outDir, batchStamp);
  await ensureDir(batchDir);
  console.log(`Batch directory: ${batchDir}`);

  let urls;
  try {
    urls = await readUrls(options.urlsFile);
  } catch (error) {
    console.error(`Cannot read URL list from ${options.urlsFile}:`, error.message);
    process.exitCode = 1;
    return;
  }

  if (!urls.length) {
    console.warn('No URLs found in the list. Add some entries to proceed.');
    return;
  }

  console.log(
    `Starting screenshots for ${urls.length} URL(s), ${options.shotsPerDevice} screen(s) per URL (max ${MAX_SEGMENTS_PER_PAGE}).`,
  );

  const summary = [];

  for (const url of urls) {
    console.log(`\n>>> ${url}`);
    try {
      const desktopShots = await makeShot({
        url,
        outDir: batchDir,
        proxy: options.proxy,
        headless: options.headless,
        shots: options.shotsPerDevice,
        copiesPerScreen: options.copiesPerScreen,
        mobile: false,
        channel: options.channel,
        cdpEndpoint: options.cdpEndpoint,
      });
      console.log(`Desktop shots: ${desktopShots.length}`);

      summary.push({
        url,
        desktop: desktopShots,
      });

      if (options.openAfterEach) {
        openInChrome(desktopShots[0], options.viewerExecutable);
      }
    } catch (error) {
      console.error(`Failed to capture ${url}: ${error.message}`);
    }
  }

  console.log('\nDone. Summary:');
  for (const entry of summary) {
    console.log(`- ${entry.url}`);
    console.log(`  desktop: ${entry.desktop.length} file(s)`);
  }
  console.log(`Files stored under: ${batchDir}`);
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
  process.exitCode = 1;
});
