import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Check your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('📋 Running database migration...\n');
    
    const sql = fs.readFileSync('./add-file-columns.sql', 'utf8');
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const statement of statements) {
      try {
        const trimmed = statement.trim();
        if (!trimmed) continue;
        
        // Use admin API for migrations
        const { error } = await supabase.rpc('exec_sql', { sql: trimmed });
        
        if (error) {
          console.warn('⚠️  Warning:', error.message);
          // Some errors are expected (e.g., if columns already exist)
          if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
            errorCount++;
          }
        } else {
          successCount++;
          console.log('✅ Executed:', trimmed.substring(0, 60) + '...');
        }
      } catch (err) {
        console.warn('⚠️  Error in statement:', err.message);
      }
    }
    
    console.log(`\n✅ Migration complete! (${successCount} successful, ${errorCount} errors)`);
    console.log('\n📝 Next steps:');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Copy and paste content of add-file-columns.sql');
    console.log('3. Run the SQL to add the missing columns');
    console.log('\n✨ OR you can manually run the SQL script in the Supabase dashboard');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
