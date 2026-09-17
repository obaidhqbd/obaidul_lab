import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const root = process.cwd();
const dist = path.join(root, 'dist');
const mustExist = [
  'index.html', 'app.js', 'styles.css', 'sw.js', 'data/catalog.enc.json',
  'data/site.json', 'data/build-info.json', 'sitemap.xml',
  'assets/vendor/jszip.min.js'
];

if (!fs.existsSync(dist)) throw new Error('dist directory was not generated.');

for (const rel of mustExist) {
  if (!fs.existsSync(path.join(dist, rel))) {
    throw new Error(`Missing build output: ${rel}`);
  }
}

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(path.relative(dist, p).replaceAll(path.sep, '/'));
  }
  return out;
}

const files = walk(dist);
if (files.some(f => f.startsWith('Classes/') || f.startsWith('Blogs/'))) {
  throw new Error('Raw source content leaked into dist.');
}
if (files.some(f => /(^|\/)site-config\.json$/.test(f))) {
  throw new Error('site-config.json must not be published directly.');
}

const info = JSON.parse(fs.readFileSync(path.join(dist, 'data/build-info.json'), 'utf8'));
if (info.schemaVersion !== 1 || info.resourceFormat !== 'AES-256-GCM') {
  throw new Error('Invalid build-info.json.');
}

const catalogEnvelope = JSON.parse(fs.readFileSync(path.join(dist, 'data/catalog.enc.json'), 'utf8'));
if (catalogEnvelope.algorithm !== 'AES-256-GCM' || catalogEnvelope.kdf !== 'PBKDF2-SHA256' || !catalogEnvelope.data || !catalogEnvelope.aad) {
  throw new Error('Invalid catalog envelope.');
}

function validateEnvelope(file) {
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.algorithm !== 'AES-256-GCM' || env.kdf !== 'PBKDF2-SHA256' ||
      !env.data || !env.salt || !env.iv || !env.tag || !env.aad) {
    throw new Error(`Invalid encrypted resource: ${path.relative(dist, file)}`);
  }
  return env;
}

const resourceFiles = [];
for (const type of ['classes', 'blogs']) {
  const dir = path.join(dist, 'data', type);
  const typeFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.enc.json')) : [];
  for (const name of typeFiles) resourceFiles.push(path.join(dir, name));
}
resourceFiles.forEach(validateEnvelope);

const password = process.env.CLASS_ACCESS_PASSWORD || '';
if (password) {
  function decrypt(env) {
    const salt = Buffer.from(env.salt, 'hex');
    const iv = Buffer.from(env.iv, 'base64');
    const tag = Buffer.from(env.tag, 'base64');
    const data = Buffer.from(env.data, 'base64');
    const key = crypto.pbkdf2Sync(password, salt, env.iterations, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(env.aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  const catalog = JSON.parse(decrypt(catalogEnvelope).toString('utf8'));
  if (!Array.isArray(catalog.classes) || !Array.isArray(catalog.blogs)) {
    throw new Error('Decrypted catalog does not contain valid classes/blogs arrays.');
  }

  for (const type of ['classes','blogs']) {
    for (const item of catalog[type]) {
      if (!item.resource) throw new Error(`Missing resource path for ${type} item ${item.id}`);
      const rel = item.resource.replace(/^\.\/?/, '');
      const file = path.join(dist, rel);
      if (!fs.existsSync(file)) throw new Error(`Catalog resource missing: ${rel}`);
      const bytes = decrypt(validateEnvelope(file));
      if (!bytes.length) throw new Error(`Decrypted resource is empty: ${rel}`);

      const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oml-verify-'));
      const zipFile = path.join(probeDir, 'item.zip');
      fs.writeFileSync(zipFile, bytes);
      try {
        execFileSync('unzip', ['-tq', zipFile], {stdio:'pipe'});
      } catch {
        throw new Error(`Encrypted resource does not contain a valid ZIP: ${rel}`);
      } finally {
        fs.rmSync(probeDir, {recursive:true,force:true});
      }
    }
  }
} else {
  console.warn('CLASS_ACCESS_PASSWORD not provided; cryptographic decryption test skipped.');
}

console.log('Build verification passed.');
