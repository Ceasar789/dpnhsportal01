const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const status = process.env.BACKUP_STATUS;
const backupId = process.env.BACKUP_ID;
const storagePath = process.env.BACKUP_STORAGE_PATH || null;
const errorMessage = process.env.BACKUP_ERROR_MESSAGE || null;

if (!supabaseUrl || !serviceRoleKey || !status) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BACKUP_STATUS are required.');
}

const response = await fetch(`${supabaseUrl}/rest/v1/backup_history${backupId ? `?id=eq.${encodeURIComponent(backupId)}` : ''}`, {
  method: backupId ? 'PATCH' : 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    Prefer: backupId ? 'return=minimal' : 'return=representation',
  },
  body: JSON.stringify(backupId
    ? { status, completed_at: new Date().toISOString(), storage_path: storagePath, error_message: errorMessage }
    : { status, storage_path: storagePath }),
});

if (!response.ok) {
  throw new Error(`Could not update backup_history: ${response.status} ${await response.text()}`);
}

if (!backupId) {
  const rows = await response.json();
  const createdId = rows[0]?.id;
  if (!createdId) throw new Error('backup_history did not return a backup id.');
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs/promises');
    await fs.appendFile(process.env.GITHUB_OUTPUT, `backup_id=${createdId}\n`);
  }
  console.log(`Backup history started: ${createdId}`);
} else {
  console.log(`Backup history updated: ${backupId} (${status})`);
}
