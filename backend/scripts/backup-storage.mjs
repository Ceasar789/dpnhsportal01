import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDirectory = process.env.BACKUP_DIRECTORY || 'backup/storage';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const headers = {
  Authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function listFiles(bucket, prefix = '') {
  const entries = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const response = await request(`${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const page = await response.json();
    entries.push(...page);
    if (page.length < limit) return entries;
    offset += limit;
  }
}

async function collectFiles(bucket, prefix = '') {
  const files = [];
  for (const entry of await listFiles(bucket, prefix)) {
    const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      files.push(objectPath);
    } else {
      files.push(...await collectFiles(bucket, objectPath));
    }
  }
  return files;
}

const buckets = await (await request(`${supabaseUrl}/storage/v1/bucket`)).json();
let downloaded = 0;

for (const bucket of buckets) {
  const files = await collectFiles(bucket.id);
  for (const objectPath of files) {
    const response = await request(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket.id)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`);
    const destination = path.join(outputDirectory, bucket.id, ...objectPath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
    console.log(`Downloaded ${bucket.id}/${objectPath}`);
  }
}

console.log(`Storage backup complete: ${downloaded} file(s) from ${buckets.length} bucket(s).`);
