import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = process.cwd();
const configPath = path.join(root, 'config.json');
const examplePath = path.join(root, 'bridge', 'config.example.json');
const rl = readline.createInterface({ input, output });

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

try {
  if (!fs.existsSync(path.join(root, 'bridge', 'server.mjs'))) {
    throw new Error('Run this command from the DJRequestLive project folder.');
  }

  const existing = readJson(configPath);
  const example = readJson(examplePath) || {};
  const config = existing || example;
  if (!existing && fs.existsSync(configPath)) {
    const backup = configPath + '.broken-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(configPath, backup);
    console.log('The existing config was invalid JSON; preserved it as ' + path.basename(backup));
  }

  console.log('\nSI DJ remote Bridge setup');
  console.log('This saves the cloud connection into config.json. The running Bridge reads it automatically; no restart is needed.\n');

  const currentUrl = config.cloud?.url || 'https://djrequestlive.com';
  const urlInput = (await rl.question('DJRequestLive cloud URL [' + currentUrl + ']: ')).trim();
  const cloudUrl = (urlInput || currentUrl).replace(/\/$/, '');
  let parsedUrl;
  try { parsedUrl = new URL(cloudUrl); } catch { throw new Error('That cloud URL is not valid.'); }
  if (parsedUrl.protocol !== 'https:') throw new Error('Cloud URL must start with https://');

  console.log('Paste the NEW token value OR the whole JSON block copied from Studio.');
  let pastedToken = (await rl.question('Pairing token: ')).trim();
  // Terminal line prompts normally capture only the first line of a multiline paste.
  // If the user pasted a JSON block, collect subsequent lines until the token is present.
  while (!/[a-f0-9]{64}/i.test(pastedToken)) {
    if (!pastedToken || pastedToken === '{' || pastedToken.includes('"cloud"') || pastedToken.includes('"url"')) {
      try {
        pastedToken += '\\n' + (await rl.question(''));
      } catch {
        break;
      }
    } else {
      break;
    }
  }
  // Accept a raw token, surrounding quotes, a single-line token field, or a pasted JSON block.
  const matches = pastedToken.match(/[a-f0-9]{64}/ig) || [];
  const token = matches.length === 1 ? matches[0] : '';
  if (!token) {
    throw new Error('Could not find exactly one 64-character pairing token. Run setup again and paste the token value or the full JSON block from Studio.');
  }

  config.source = config.source || 'virtualdj-history';
  config.virtualdj = config.virtualdj || { baseUrl: 'http://127.0.0.1:80', bearer: '' };
  config.rekordbox = config.rekordbox || { historyFile: '' };
  config.virtualdjHistory = config.virtualdjHistory || { historyFile: '' };
  config.cloud = { url: cloudUrl, token };

  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tempPath, configPath);
  try { fs.chmodSync(configPath, 0o600); } catch {}

  console.log('\nSaved and validated ' + path.relative(root, configPath) + '.');
  console.log('Config saved. Because you just pulled new Bridge code, restart the Bridge once: stop its old Terminal process with Control+C, then run npm run bridge.');
  console.log('For safety, the token was not printed back to the screen.');
} catch (error) {
  console.error('\nSetup stopped: ' + (error?.message || error));
  process.exitCode = 1;
} finally {
  rl.close();
}
