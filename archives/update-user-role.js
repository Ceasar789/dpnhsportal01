import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jbojeaizyjuigmmdtwfm.supabase.co';
const supabaseAnonKey = 'sb_publishable_NBHGUeDyDLmMlSpOMa30UA_-3kbw7RU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateUserRole() {
  try {
    console.log('📋 Fetching user by email: philiphermosa087@gmail.com');
    
    // Get user by email
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'philiphermosa087@gmail.com')
      .single();
    
    if (error) {
      console.error('❌ Error fetching user:', error);
      return;
    }
    
    if (!data) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', data);
    
    // Update user role to main_admin
    console.log('🔄 Updating role to main_admin...');
    const { data: updatedData, error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'main_admin' })
      .eq('id', data.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating role:', updateError);
      return;
    }
    
    console.log('✅ User role updated successfully:', updatedData);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

updateUserRole();
