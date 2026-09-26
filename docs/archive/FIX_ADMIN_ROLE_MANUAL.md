# Fix Admin Role - Manual Steps

## ❌ Problem
Admin account (philiphermosa087@gmail.com) has:
- ✅ Database role: 'main_admin' (CORRECT)
- ❌ Auth metadata role: 'student' (WRONG!)

This mismatch causes the system to fetch 'student' instead of 'main_admin'.

---

## ✅ Solution: Update Auth Metadata in Supabase

### Option 1: Manual Update (Easiest)

**Step 1: Go to Supabase Dashboard**
- URL: https://app.supabase.com
- Select your project

**Step 2: Go to Authentication → Users**
- Find user: `philiphermosa087@gmail.com`
- Click on the user to open details

**Step 3: Edit User Metadata**
- Look for section: **User Metadata** or **Custom Metadata**
- Find or create this JSON:
```json
{
  "name": "Admin",
  "role": "main_admin"
}
```

**Step 4: Update the role field**
- Change `"role": "student"` to `"role": "main_admin"`
- Click **Save** or **Update**

**Step 5: Clear & Test**
1. Clear browser cache: `Ctrl+Shift+Delete`
2. Hard refresh: `Ctrl+Shift+R`
3. Try login again

---

### Option 2: Using Script (More Reliable)

**Prerequisites:**
- You need the Supabase **Service Role Key** (different from Anon Key)

**Step 1: Get Service Role Key**
1. Go to Supabase Dashboard → Settings → API
2. Copy the **Service Role Key** (Secret, not the Anon key)
3. ⚠️ Keep this secret! Don't share it.

**Step 2: Run the fix script**
```bash
# Set the key as environment variable and run script
$env:SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
node fix-admin-role.js
```

**Step 3: Expected Output**
```
✅ Found user: philiphermosa087@gmail.com
✅ Auth metadata updated successfully!
✨ SUCCESS! Roles now match: "main_admin"
```

---

### Option 3: SQL Update (Advanced)

If you have direct SQL access, you can try updating auth metadata via SQL:

```sql
-- Check current user
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'philiphermosa087@gmail.com';

-- This approach may not work due to RLS - use Supabase dashboard instead
```

---

## 🔍 Verify the Fix

After updating, check:

1. **In Supabase Dashboard:**
   - Authentication → Users → Find the user
   - Check User Metadata shows `"role": "main_admin"`

2. **In Database:**
   ```sql
   SELECT email, role FROM profiles 
   WHERE email = 'philiphermosa087@gmail.com';
   ```
   Should show: `main_admin`

3. **In Browser Console:**
   - Clear cache and refresh
   - Go to `/faculty-login`
   - Enter credentials
   - Should see in console: `databaseRole: 'main_admin'`

---

## 📋 Complete Checklist

- [ ] Found user in Supabase Authentication
- [ ] Updated User Metadata: `"role": "main_admin"`
- [ ] Saved the changes
- [ ] Cleared browser cache (`Ctrl+Shift+Delete`)
- [ ] Hard refreshed (`Ctrl+Shift+R`)
- [ ] Tested login at `/faculty-login`
- [ ] Browser console shows: `databaseRole: 'main_admin'`
- [ ] Successfully logged in to `/admin-dashboard`

---

## 🚨 If Still Not Working

**Step 1: Verify the change was saved**
- Go back to Supabase Dashboard
- Check User Metadata again
- Make sure it says `"role": "main_admin"`

**Step 2: Restart dev server**
```bash
# Stop the server: Ctrl+C
# Clear npm cache
npm cache clean --force

# Restart
npm run dev
```

**Step 3: Clear all browser data**
```javascript
// Open DevTools Console and paste:
localStorage.clear()
sessionStorage.clear()
// Then refresh the page
```

**Step 4: Check for RLS Issues**
- If profile fetch still fails, there might be RLS policy issues
- Contact Supabase support or check RLS settings

---

## 💡 Why This Happens

The system uses role from these sources in priority order:

1. ✅ **Database (profiles table)** - Source of truth
2. ✅ **Auth Metadata** - Backup/fast source
3. ✅ **Default to 'student'** - Final fallback

The admin's database role was correct but auth metadata wasn't synced, so it fell back to metadata which had 'student'. Now we're syncing them!

