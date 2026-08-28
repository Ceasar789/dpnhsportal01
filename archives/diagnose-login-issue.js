// ============================================
// DIAGNOSTIC SCRIPT - Check user roles in Supabase
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseLoginIssue(email) {
  console.log(`\n📋 Diagnosing login issue for: ${email}\n`);

  try {
    // 1. Check auth_users table (role in metadata)
    console.log('1️⃣ Checking Supabase Auth Metadata:');
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.warn('⚠️ Could not access auth admin API (need service role key)');
    } else {
      const user = users.find(u => u.email === email);
      if (user) {
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Auth Metadata Role: ${user.user_metadata?.role || 'NOT SET'}`);
        console.log(`   Email Confirmed: ${user.email_confirmed_at ? 'YES ✅' : 'NO ❌'}`);
      } else {
        console.log(`   ❌ User not found in auth system`);
      }
    }

    // 2. Check profiles table (role in database)
    console.log('\n2️⃣ Checking Profiles Table (Database):');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (profileError) {
      console.log(`   ⚠️ Error fetching profile: ${profileError.message}`);
    } else if (profile) {
      console.log(`   Email: ${profile.email}`);
      console.log(`   Database Role: ${profile.role || 'NOT SET'}`);
      console.log(`   Name: ${profile.name || 'NOT SET'}`);
      console.log(`   Status: ${profile.status || 'NOT SET'}`);
    } else {
      console.log(`   ❌ No profile found in database`);
    }

    // 3. Role comparison
    console.log('\n3️⃣ Role Comparison:');
    if (user && profile) {
      const authRole = (user.user_metadata?.role || 'student').toLowerCase().trim();
      const dbRole = (profile.role || 'student').toLowerCase().trim();
      console.log(`   Auth Role: "${authRole}"`);
      console.log(`   DB Role: "${dbRole}"`);
      console.log(`   Match: ${authRole === dbRole ? '✅ YES' : '❌ NO'}`);
      console.log(`\n   ⚠️ ISSUE: Roles don't match! This is why login fails.`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example usage - replace with your test email
const testEmail = process.argv[2] || 'student@dpnhs.edu.ph';
diagnoseLoginIssue(testEmail);
