# 🔒 Supabase RLS Setup for User Management

## The Problem
The admin dashboard can't create users because Supabase RLS policies are blocking the profile insert/upsert.

## The Solution

### Step 1: Go to Supabase Console
- https://app.supabase.com
- Select your project
- Click **SQL Editor** (left sidebar)

### Step 2: Run This SQL

```sql
-- STEP 1: Disable RLS on profiles table temporarily to test
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- STEP 2: Enable RLS again with proper policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- STEP 3: Create policies for admin to manage all users
CREATE POLICY "admins_can_manage_all_profiles" ON profiles
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'main_admin'
  ) OR auth.uid() = id)
  WITH CHECK (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'main_admin'
  ) OR auth.uid() = id);

-- STEP 4: Allow reading profiles for authenticated users
CREATE POLICY "users_can_view_all_profiles" ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- STEP 5: Create policy for auth users to update own profile
CREATE POLICY "users_can_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

### Step 3: Test User Creation

1. Go back to Admin Dashboard
2. Click "Create User"
3. Fill in:
   - Full Name: Test User
   - Email: testuser@test.com
   - Role: Teacher
   - Department: ICT
   - Password: password123
4. Click "Create" button
5. **It should now complete immediately** ✅

## Expected Behavior After Fix

✅ User created in Supabase  
✅ Admin stays on Admin Dashboard (no redirect)  
✅ User appears in the users list  
✅ New user receives confirmation email  
✅ Delete user also removes from Supabase  

---

## If It Still Doesn't Work

Try this simpler approach:

```sql
-- Option A: Temporarily disable RLS (for testing only)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Then after testing, enable with permissive policy:
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_for_testing" ON profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

---

## After User Creation is Working

Once user creation works:
1. Delete the "allow_all_for_testing" policy
2. Use the proper admin policies from Step 2
3. Test that only admins can create/delete users
