// ============================================
// FIX SCRIPT: Update Admin Auth Metadata
// ============================================
// This script updates the auth metadata for the admin user
// to ensure they have role='main_admin' in auth system

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dsdwomejcigjcxuksvqt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ USE SERVICE ROLE KEY (from Supabase Settings)

if (!supabaseServiceKey) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY not set');
  console.log('📝 Instructions:');
  console.log('1. Go to Supabase Dashboard → Settings → API');
  console.log('2. Copy the "Service Role Key" (NOT the Anon Key)');
  console.log('3. Run: SUPABASE_SERVICE_ROLE_KEY="your_key" node fix-admin-role.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAdminRole() {
  console.log('🔧 Starting admin role fix...\n');

  const email = 'philiphermosa087@gmail.com';
  
  try {
    // Get user by email
    console.log(`🔍 Finding user: ${email}`);
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
      return;
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      return;
    }

    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
    console.log(`📋 Current metadata:`, user.user_metadata);

    // Update auth metadata
    console.log('\n📤 Updating auth metadata to role="main_admin"...');
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          name: user.user_metadata?.name || 'Admin',
          role: 'main_admin'
        }
      }
    );

    if (updateError) {
      console.error('❌ Error updating user:', updateError.message);
      return;
    }

    console.log('✅ Auth metadata updated successfully!');
    console.log(`📋 New metadata:`, updatedUser.user_metadata);

    // Verify database role
    console.log('\n🔍 Verifying database role...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, status')
      .eq('email', email)
      .single();

    if (profileError) {
      console.warn('⚠️ Could not fetch profile:', profileError.message);
    } else {
      console.log('✅ Database profile:', profile);
      
      // Verify they match
      const dbRole = profile?.role;
      const metaRole = updatedUser.user_metadata?.role;
      
      if (dbRole === metaRole) {
        console.log(`\n✨ SUCCESS! Roles now match: "${dbRole}"`);
      } else {
        console.warn(`\n⚠️ WARNING: Roles don't match!`);
        console.warn(`   Database: "${dbRole}"`);
        console.warn(`   Metadata: "${metaRole}"`);
      }
    }

    console.log('\n🎉 Admin role fix complete!');
    console.log('📌 Next steps:');
    console.log('1. Clear browser cache (Ctrl+Shift+Delete)');
    console.log('2. Hard refresh (Ctrl+Shift+R)');
    console.log('3. Try logging in again to /faculty-login');

  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

fixAdminRole();
