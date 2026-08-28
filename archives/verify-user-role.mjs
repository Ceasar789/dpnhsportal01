import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jbojeaizyjuigmmdtwfm.supabase.co';
const supabaseKey = 'sb_publishable_NBHGUeDyDLmMlSpOMa30UA_-3kbw7RU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  try {
    // Try to get ALL profiles first
    console.log('📋 Attempting to fetch all profiles...');
    const { data: allData, error: allError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .limit(5);
    
    if (allError) {
      console.log('❌ Error fetching all profiles:', allError.message);
      console.log('   Code:', allError.code);
      console.log('   Details:', allError.details);
    } else {
      console.log('✅ Fetched ' + (allData?.length || 0) + ' profiles');
      allData?.forEach(u => console.log('   -', u.email, '(' + u.role + ')'));
    }
    
    console.log('\n📋 Now trying to fetch specific user...');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', 'philiphermosa087@gmail.com');
    
    if (error) {
      console.log('❌ Error:', error.message);
      console.log('   Code:', error.code);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('❌ No user found with that email');
      return;
    }
    
    console.log('✅ User found:');
    data.forEach(user => {
      console.log('   Email:', user.email);
      console.log('   Role:', user.role);
      console.log('   ID:', user.id);
    });
    
  } catch (err) {
    console.log('❌ Exception:', err.message);
  }
}

verify();
