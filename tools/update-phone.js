#!/usr/bin/env node
'use strict';
/*
 * Downloads the latest Buoy from GitHub and installs it on a USB-connected KaiOS phone.
 *
 *   node tools/update-phone.js [--build certified|privileged] [--ref <branch-or-tag>]
 *                              [--release] [--from <dir>] [--force] [--dry-run] [--start]
 *
 * It reuses gdeploy's own connection and install modules (gdeploy must be installed) but installs under
 * a FIXED app id. gdeploy normally invents a new random id on every install, which gives the app a new
 * storage area and loses its chats. With a fixed id the install is an update in place.
 *
 * Needs: node, adb, curl, tar, gdeploy, and a phone with USB debugging on.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const REPO = 'jgm240/KaiBuoy';
const BUILDS = {
  certified: { dir: 'buoy-certified', id: 'buoy-c', name: 'Buoy C' },
  privileged: { dir: 'buoy', id: 'buoy', name: 'Buoy' }
};

function parseArgs(argv) {
  const o = { build: 'certified', ref: '', release: false, from: '', force: false, dry: false, start: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--build') o.build = argv[++i];
    else if (a === '--ref') o.ref = argv[++i];
    else if (a === '--release') o.release = true;
    else if (a === '--from') o.from = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dry = true;
    else if (a === '--start') o.start = true;
    else { console.error('Unknown option: ' + a); process.exit(2); }
  }
  if (!BUILDS[o.build]) { console.error('--build must be certified or privileged'); process.exit(2); }
  return o;
}

function log(msg) { console.log(msg); }
function die(msg) { console.error('\nError: ' + msg); process.exit(1); }

// gdeploy is a CLI; we borrow the node-firefox modules it depends on.
function findGdeployModules() {
  const candidates = [];
  if (process.env.GDEPLOY_DIR) candidates.push(process.env.GDEPLOY_DIR);
  try {
    const bin = execSync('command -v gdeploy', { encoding: 'utf8', shell: '/bin/sh' }).trim();
    if (bin) candidates.push(path.dirname(fs.realpathSync(bin)));
  } catch (e) { /* not on PATH */ }
  for (const dir of candidates) {
    const nm = path.join(dir, 'node_modules');
    if (fs.existsSync(path.join(nm, 'node-firefox-connect')) && fs.existsSync(path.join(nm, 'node-firefox-install-app'))) {
      return { connect: require(path.join(nm, 'node-firefox-connect')), installApp: require(path.join(nm, 'node-firefox-install-app')) };
    }
  }
  die('Could not find gdeploy. Install it, or set GDEPLOY_DIR to its folder.');
}

function semverParts(v) { return String(v || '0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0); }
function newer(a, b) { // is version a newer than b?
  const x = semverParts(a), y = semverParts(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}

function curlJson(url) {
  try { return JSON.parse(execFileSync('curl', ['-fsSL', '-H', 'Accept: application/vnd.github+json', url], { encoding: 'utf8' })); }
  catch (e) { return null; }
}

// Download a GitHub archive into a fresh empty folder and return the app folder inside it.
function fetchApp(opts, build) {
  if (opts.from) {
    const dir = path.resolve(opts.from);
    if (!fs.existsSync(path.join(dir, 'manifest.webapp'))) die(dir + ' has no manifest.webapp');
    return { dir: dir, label: 'local folder ' + dir };
  }
  let ref = opts.ref, kind = 'heads';
  if (!ref && opts.release) {
    const rel = curlJson('https://api.github.com/repos/' + REPO + '/releases/latest');
    if (!rel || !rel.tag_name) die('No GitHub release found. Run without --release to use the main branch.');
    ref = rel.tag_name; kind = 'tags';
  }
  if (!ref) ref = 'main';
  if (opts.ref && /^v?\d/.test(opts.ref)) kind = 'tags';
  const url = 'https://github.com/' + REPO + '/archive/refs/' + kind + '/' + ref + '.tar.gz';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buoy-update-'));
  const tarball = path.join(tmp, 'src.tar.gz');
  log('Downloading ' + url);
  try { execFileSync('curl', ['-fsSL', '-o', tarball, url], { stdio: 'inherit' }); }
  catch (e) { die('Download failed for ' + url); }
  const out = path.join(tmp, 'src');
  fs.mkdirSync(out);
  execFileSync('tar', ['-xzf', tarball, '-C', out]);         // data only: nothing from it is executed
  const top = fs.readdirSync(out)[0];
  const dir = path.join(out, top, build.dir);
  if (!fs.existsSync(path.join(dir, 'manifest.webapp'))) die('The download has no ' + build.dir + '/manifest.webapp');
  return { dir: dir, label: REPO + ' ' + ref, tmp: tmp };
}

function readManifest(dir) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webapp'), 'utf8')); } catch (e) { die('manifest.webapp is not valid JSON'); }
  const needed = ['index.html', 'app.js', 'style.css'];
  if (fs.readFileSync(path.join(dir, 'index.html'), 'utf8').indexOf('features.js') >= 0) needed.push('features.js');
  for (const f of needed) if (!fs.existsSync(path.join(dir, f))) die('The app folder is missing ' + f);
  return m;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const build = BUILDS[opts.build];
  const src = fetchApp(opts, build);
  const manifest = readManifest(src.dir);
  const expectType = opts.build === 'certified' ? 'certified' : 'privileged';
  if (manifest.type !== expectType) die('Expected a ' + expectType + ' app but the manifest says "' + manifest.type + '"');
  log('Got ' + manifest.name + ' ' + manifest.version + ' (' + manifest.type + ') from ' + src.label);

  const { connect, installApp } = findGdeployModules();
  const port = process.env.DEBUGGER_PORT || 6000;
  try { execFileSync('adb', ['get-state'], { stdio: 'pipe' }); } catch (e) { die('No phone found over ADB. Plug it in and turn on USB debugging.'); }
  execFileSync('adb', ['forward', 'tcp:' + port, 'localfilesystem:/data/local/debugger-socket']);
  const client = await connect(port);
  const webapps = await new Promise((res, rej) => client.getWebapps((err, w) => err ? rej(err) : res(w)));
  const apps = await new Promise((res, rej) => webapps.getInstalledApps((err, a) => err ? rej(err) : res(a)));

  const mine = apps.filter(a => a.manifestURL && a.manifestURL.indexOf('app://' + build.id + '/') === 0);
  const same = apps.filter(a => a.name === manifest.name && !(a.manifestURL || '').startsWith('app://' + build.id + '/'));
  const installed = mine[0];
  const installedVersion = installed && (installed.manifest && installed.manifest.version);
  log(installed ? 'On the phone: ' + installed.name + (installedVersion ? ' ' + installedVersion : '') + ' (id ' + build.id + ')' : 'Not installed under id "' + build.id + '" yet.');
  if (same.length) log('Note: ' + same.length + ' other copy/copies named "' + manifest.name + '" are installed under random ids (older gdeploy installs). Remove them with: gdeploy uninstall <id>');

  if (installed && installedVersion && !opts.force && !newer(manifest.version, installedVersion)) {
    log('Already up to date. Use --force to reinstall anyway.');
    return cleanup(src, client, 0);
  }
  if (opts.dry) {
    log('\nDry run: would install ' + manifest.name + ' ' + manifest.version + ' under id "' + build.id + '". Nothing was changed on the phone.');
    return cleanup(src, client, 0);
  }

  log('Installing ' + manifest.name + ' ' + manifest.version + ' ...');
  const appId = await installApp({ appPath: src.dir, client: client, id: build.id });
  log('Installed. App id: ' + appId);
  if (opts.start) {
    await new Promise(res => webapps.launch('app://' + build.id + '/manifest.webapp', () => res()));
    log('Started.');
  }
  return cleanup(src, client, 0);
}

function cleanup(src, client, code) {
  try { client.close && client.close(); } catch (e) { /* ignore */ }
  if (src.tmp) { try { fs.rmSync(src.tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  process.exit(code);
}

main().catch(err => die(err && err.message ? err.message : String(err)));
