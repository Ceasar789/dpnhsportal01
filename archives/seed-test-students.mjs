// ============================================
// FILE: archives/seed-test-students.mjs
// Seeds 60 inert dummy STUDENT accounts for load testing.
//
// These are dead weight on purpose. They can log in and they appear in the
// admin's User Management; they cause nothing. This script writes to exactly
// three places and nowhere else:
//
//   auth.users  (via the Admin API)
//   profiles
//   students
//
// It does NOT enrol anyone (section_students is untouched — sections are
// assigned by hand in the UI afterwards), does NOT write notifications or
// activity_logs, does NOT touch sections.current_enrollment, and does NOT
// create or alter a single schema object.
//
// Why a Node script and not SQL: profiles.id and students.id are both
// `REFERENCES auth.users(id)`, and auth.users is owned by Supabase Auth —
// a login also needs a matching auth.identities row. Hand-inserting into
// those tables is fragile and version-dependent, so account creation goes
// through auth.admin.createUser().
//
// Why createUser and not signUp: signUp mails a confirmation to all 60
// addresses and swaps the client's active session. createUser with
// email_confirm:true does neither, and the accounts are immediately usable.
//
// Verified before writing this (do not re-derive): there is no
// handle_new_user trigger; the only trigger on profiles is
// guard_profile_privileges, which is BEFORE UPDATE and does not fire on
// insert; students has no insert trigger. These inserts have no side
// effects.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
//   node archives/seed-test-students.mjs
//
//   Add --delete to remove all 60 again when testing is over.
//   Add --dry-run to print the roster and touch nothing.
//
// ── THE KEY ──────────────────────────────────────────────────────────────
// The service_role key bypasses RLS entirely. It is read from the
// environment and never written to disk. It must NEVER be given a VITE_
// prefix: Vite inlines every VITE_* variable into the client bundle at build
// time, which would publish it to every visitor of the site.
// ============================================

import { createClient } from '@supabase/supabase-js';

// ---- Configuration -------------------------------------------------------

const SHARED_PASSWORD = '123456789';
const EMAIL_DOMAIN = 'example.com';   // reserved by RFC 2606 — always valid, never deliverable
const LRN_START = 108123456789n;      // 12 digits, incremented by one per student
const STUDENT_NUMBER_PREFIX = '2026-';
const CREATE_DELAY_MS = 200;          // Supabase Auth throttles bulk creation

// Three blocks of twenty, so one block can be assigned to one section.
// Block membership is carried by the NUMBER, not the name: students 01-20
// are Block A, 21-40 Block B, 41-60 Block C. Sort by email in User
// Management and the blocks are contiguous.
const NAMES = [
  // Block A — student01 … student20
  'Andrea Bautista', 'Miguel Santos', 'Sofia Reyes', 'Gabriel Cruz',
  'Isabella Ramos', 'Joshua Mendoza', 'Althea Garcia', 'Nathaniel Torres',
  'Clarisse Villanueva', 'Rafael Domingo', 'Beatriz Aquino', 'Emmanuel Navarro',
  'Danica Salazar', 'Lorenzo Pascual', 'Kyla Marquez', 'Sebastian Alvarez',
  'Trisha Gonzales', 'Adrian Lagman', 'Patricia Fernandez', 'Kristoffer Bacani',
  // Block B — student21 … student40
  'Camille Ocampo', 'Dominic Herrera', 'Angelica Rosales', 'Vincent Del Rosario',
  'Mariel Castillo', 'Jerome Panganiban', 'Nicole Abad', 'Christian Soriano',
  'Faith Delgado', 'Marco Bernardo', 'Jasmine Aguilar', 'Elijah Carreon',
  'Roselle Manalo', 'Bryan Espino', 'Charmaine Lucero', 'Kenneth Dizon',
  'Aubrey Sarmiento', 'Paulo Gutierrez', 'Hazel Nicolas', 'Ronnie Valdez',
  // Block C — student41 … student60
  'Shaira Bulaong', 'Jomar Padilla', 'Arianne Corpuz', 'Dennis Magsino',
  'Karylle Jimenez', 'Fritz Andrada', 'Loreen Cabrera', 'Ryan Estrada',
  'Michelle Pineda', 'Alfred Bonifacio', 'Janine Rivera', 'Mark Anthony Sison',
  'Precious Almeda', 'Gerald Tolentino', 'Kimberly Fajardo', 'Renz Malinao',
  'Abigail Serrano', 'Jerick Ampong', 'Leah Bustamante', 'Carlo Villamor',
];

const blockOf = (n) => (n <= 20 ? 'A' : n <= 40 ? 'B' : 'C');

const ROSTER = NAMES.map((name, i) => {
  const n = i + 1;
  const nn = String(n).padStart(2, '0');
  return {
    n,
    block: blockOf(n),
    name,
    email: `student${nn}@${EMAIL_DOMAIN}`,
    lrn: String(LRN_START + BigInt(i)),
    studentNumber: `${STUDENT_NUMBER_PREFIX}${String(n).padStart(4, '0')}`,
  };
});

// ---- Guards --------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DELETE_MODE = args.has('--delete');

const fail = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

if (ROSTER.length !== 60) fail(`Expected 60 students, built ${ROSTER.length}.`);
for (const key of ['name', 'email', 'lrn', 'studentNumber']) {
  const seen = new Set(ROSTER.map(r => r[key]));
  if (seen.size !== 60) fail(`Duplicate ${key} in the roster — every one must be unique.`);
}
if (ROSTER.some(r => r.lrn.length !== 12)) fail('An LRN is not 12 digits.');

if (DRY_RUN) {
  printRoster();
  console.log('\n--dry-run: nothing was created.\n');
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) fail('Set SUPABASE_URL (https://<project-ref>.supabase.co).');
if (!SERVICE_ROLE_KEY) {
  fail('Set SUPABASE_SERVICE_ROLE_KEY. Supabase dashboard → Project Settings → '
    + 'API → service_role. Never give it a VITE_ prefix and never commit it.');
}
if (Object.keys(process.env).some(k => /^VITE_.*(SERVICE_ROLE|SECRET)/i.test(k))) {
  fail('A VITE_-prefixed service role / secret variable is set. Vite inlines every '
    + 'VITE_* value into the browser bundle. Rename it before running anything.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Helpers -------------------------------------------------------------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function printRoster() {
  console.log(`\n${ROSTER.length} test students — password for all: ${SHARED_PASSWORD}\n`);
  console.log('BLK  #   EMAIL                      NAME                      LRN            STUDENT NO.');
  console.log('─'.repeat(100));
  for (const r of ROSTER) {
    console.log(
      `${r.block}    ${String(r.n).padStart(2, '0')}  ${r.email.padEnd(26)} ${r.name.padEnd(25)} ${r.lrn}   ${r.studentNumber}`
    );
  }
}

/**
 * Every existing auth user, as email -> id.
 *
 * Built up front rather than reacting to an "email already registered"
 * error, because that error does not carry the existing id — and without
 * the id a re-run cannot repair a half-created student (auth user created,
 * profile insert failed) and would leave the orphan behind forever.
 */
async function loadExistingAuthUsers() {
  const byEmail = new Map();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    // supabase-js RESOLVES with { error } instead of throwing, so a bare
    // try/catch around this would catch nothing and an auth outage would
    // read as "no users exist" — which would then duplicate all 60.
    if (error) fail(`Could not list existing auth users: ${error.message}`);
    const users = data?.users || [];
    for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (users.length < perPage) break;
  }
  return byEmail;
}

// ---- Delete mode ---------------------------------------------------------

async function runDelete() {
  console.log(`\nRemoving ${ROSTER.length} test accounts…`);
  console.log('Deleting the auth user cascades to profiles and students '
    + '(both are ON DELETE CASCADE off auth.users), so this is the only delete needed.\n');

  const existing = await loadExistingAuthUsers();
  let removed = 0, missing = 0, failed = 0;

  for (const r of ROSTER) {
    const uid = existing.get(r.email);
    if (!uid) { missing++; console.log(`  –  ${r.email}  not present`); continue; }
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) { failed++; console.log(`  ✗  ${r.email}  ${error.message}`); continue; }
    removed++;
    console.log(`  ✓  ${r.email}  removed`);
    await sleep(80);
  }

  console.log(`\nRemoved ${removed}, not present ${missing}, failed ${failed}.\n`);
  if (failed > 0) process.exit(1);
}

// ---- Seed mode -----------------------------------------------------------

async function runSeed() {
  console.log(`\nSeeding ${ROSTER.length} dummy students into ${SUPABASE_URL}`);
  console.log('Writes to auth.users, profiles and students only. '
    + 'No enrolment, no notifications, no schema changes.\n');

  const existing = await loadExistingAuthUsers();
  const created = [], repaired = [], failures = [];

  for (const r of ROSTER) {
    const label = `${r.email.padEnd(26)} ${r.name.padEnd(25)}`;
    let uid = existing.get(r.email);
    let isNew = false;

    if (!uid) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: r.email,
        password: SHARED_PASSWORD,
        email_confirm: true,      // no confirmation mail; account usable at once
        user_metadata: { seeded_test_account: true },
      });
      if (error || !data?.user?.id) {
        failures.push({ ...r, stage: 'auth', message: error?.message || 'no id returned' });
        console.log(`  ✗  ${label} auth: ${error?.message || 'no id returned'}`);
        await sleep(CREATE_DELAY_MS);
        continue;
      }
      uid = data.user.id;
      isNew = true;
    }

    // Upserted, not inserted, so a re-run after a partial failure repairs the
    // row instead of colliding on the primary key.
    const { error: profileError } = await supabase.from('profiles').upsert([{
      id: uid,
      email: r.email,
      name: r.name,
      role: 'student',
      status: 'active',
    }], { onConflict: 'id' });

    if (profileError) {
      // A brand-new auth user with no profile is an orphan that no later run
      // can see from the profiles side. Roll it back rather than leave it.
      if (isNew) await supabase.auth.admin.deleteUser(uid);
      failures.push({ ...r, stage: 'profile', message: profileError.message });
      console.log(`  ✗  ${label} profile: ${profileError.message}${isNew ? ' (auth user rolled back)' : ''}`);
      await sleep(CREATE_DELAY_MS);
      continue;
    }

    const { error: studentError } = await supabase.from('students').upsert([{
      id: uid,
      lrn: r.lrn,
      student_number: r.studentNumber,
      student_status: 'Regular',
    }], { onConflict: 'id' });

    if (studentError) {
      // Left in place deliberately: the profile exists, so the account is
      // visible in User Management and a re-run will find and finish it.
      // It just cannot be enrolled into a section until this row lands,
      // because section_students.student_id references students(id).
      failures.push({ ...r, stage: 'student', message: studentError.message });
      console.log(`  ✗  ${label} student: ${studentError.message}`);
      await sleep(CREATE_DELAY_MS);
      continue;
    }

    (isNew ? created : repaired).push(r);
    console.log(`  ✓  ${label} ${isNew ? 'created ' : 'existed '} LRN ${r.lrn}`);
    if (isNew) await sleep(CREATE_DELAY_MS);
  }

  console.log(`\n${'─'.repeat(100)}`);
  console.log(`Created ${created.length}, already existed ${repaired.length}, failed ${failures.length}.`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.email}  [${f.stage}]  ${f.message}`);
  }
  printRoster();
  console.log('\nNext: assign sections yourself in the app. Nothing here enrolled anyone.');
  console.log('Block A = student01-20, Block B = student21-40, Block C = student41-60.\n');
  if (failures.length > 0) process.exit(1);
}

await (DELETE_MODE ? runDelete() : runSeed());
