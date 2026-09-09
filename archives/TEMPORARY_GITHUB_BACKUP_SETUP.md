# Temporary GitHub Actions Backup

This is a temporary backup option while the Supabase project is on the Free Plan.

## What it backs up

- Database dump from the configured Supabase database connection.
- Actual files from every Supabase Storage bucket.
- Database records and Storage files are uploaded as one GitHub Actions artifact.

The dump does not replace Supabase-managed Auth/PITR backups. Test a restore before relying on it for recovery.

## One-time setup

1. Run `archives/add-settings-backup-history.sql` in the Supabase SQL Editor. This creates the `backup_history` table used by the Admin Dashboard.
2. Push this repository to a private GitHub repository.
3. Open **Settings > Secrets and variables > Actions**.
4. Add these repository secrets:
   - `SUPABASE_DATABASE_URL`: the direct database connection string from Supabase **Connect**. Use the session pooler connection if direct IPv6 connectivity is unavailable.
   - `SUPABASE_URL`: the project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the server-only service role key.
5. Never commit any of these values or place the service role key in the Vite app.
6. Open **Actions > Temporary Supabase Backup** and run it manually once.
7. Confirm the workflow succeeds, download the artifact to verify both files, and open the Admin Dashboard **Backup History** section to confirm the completed record appears.

## Schedule and retention

The workflow runs daily at 00:30 UTC and can also be started manually. Each run writes `running`, then `completed` or `failed`, to `backup_history`, which is displayed in the Admin Dashboard. GitHub keeps each artifact for 7 days. This is temporary storage, not a long-term backup policy, so download important artifacts to a private storage location.

## Restore basics

- Database: use `pg_restore` against a temporary Supabase project first.
- Storage: extract `storage.tar.gz`, then upload each bucket folder back to its matching bucket.
- Do not restore directly to production until the test restore is verified.

When Supabase Pro is available, enable Supabase managed backups and keep this workflow only as an optional Storage backup, or disable it after confirming the new backup policy.
