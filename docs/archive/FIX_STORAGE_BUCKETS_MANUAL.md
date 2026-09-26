# 🔧 FIX Storage Bucket Upload Error

## The Problem
❌ Error: "Storage error: Internal Server Error" when uploading PDFs

## The Root Cause
✋ The SQL file was only creating buckets but **NOT setting up RLS policies**
- Buckets exist but have no access rules
- Supabase blocks uploads when policies are missing
- This causes the "Internal Server Error"

---

## ✅ Solution

### STEP 1: Run the Updated SQL in Supabase

1. Go to: **https://app.supabase.com**
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy ALL content from: `STORAGE_BUCKETS_CONFIGURATION.sql`
6. Paste it into the SQL Editor
7. Click **Run** (▶️ button)
8. ✅ All buckets and policies should be created

### STEP 2: If SQL Fails with Policy Errors

If you get "policy already exists" errors:

1. Go to **Storage** section in Supabase
2. Click the **lesson-pdfs** bucket
3. Click **Policies** tab
4. Delete any existing policies
5. Try running the SQL again

### STEP 3: Manual Policy Setup (If SQL Won't Work)

If the SQL still doesn't work, create policies manually:

**For lesson-pdfs bucket:**

1. Go to **Storage** → click **lesson-pdfs**
2. Click **Policies** tab
3. Click **New policy** → **For SELECT**
   - Choose: **Public** template
   - Click **Save**
4. Click **New policy** → **For INSERT**
   - Choose: **Authenticated user uploads** template
   - Click **Save**

**Repeat for worksheets bucket (same steps)**

---

## ✅ Verify It Works

After running SQL or setting up policies:

1. Go to TeacherDashboard
2. Click **"Choose PDF file"** button
3. Upload a test PDF file
4. ✅ Should upload successfully (no errors)
5. Check browser console - should see: ✅ File uploaded to storage

---

## 📋 What Changed

The `STORAGE_BUCKETS_CONFIGURATION.sql` now includes:
- ✅ Bucket creation (already had this)
- ✅ **NEW: RLS Policies for all buckets**
- ✅ Public access policies (for lesson-pdfs, worksheets, etc.)
- ✅ Authenticated upload policies
- ✅ User delete policies

---

## 🚨 If It Still Doesn't Work

Check these:

1. **Verify buckets exist:**
   - Go to Supabase → Storage
   - Should see: lesson-pdfs, worksheets, etc.

2. **Verify policies exist:**
   - Click lesson-pdfs bucket → Policies tab
   - Should see multiple policies listed

3. **Check bucket is public:**
   - Go to Storage → lesson-pdfs
   - Look for settings/info icon
   - Should say "Public bucket"

4. **Try uploading manually in Supabase:**
   - Go to Storage → lesson-pdfs
   - Click **Upload** button
   - Try uploading a test file
   - If it fails here, the issue is with Supabase setup, not your code

---

## 📞 Need More Help?

- Check the browser console (F12) for detailed errors
- Look at the Supabase logs: Dashboard → Logs section
- Verify you're logged in with correct credentials
