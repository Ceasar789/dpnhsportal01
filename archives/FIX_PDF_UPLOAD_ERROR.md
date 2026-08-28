# 🚀 FIX PDF UPLOAD ERROR - STEP BY STEP

## Error You're Seeing:
```
Error uploading PDF: Storage upload failed: Failed to fetch
```

---

## ✅ QUICK FIX (5 MINUTES)

### Step 1: Check Your Database Setup
1. Go to **Supabase Dashboard** (https://app.supabase.com)
2. Select your **NEW database** (jllstakxiamxiycnwrbd)
3. Go to **SQL Editor**
4. Copy & paste the entire content of `VERIFY_AND_FIX_DATABASE.sql`
5. Click **RUN**

**This will:**
- ✅ Check if tables exist
- ✅ Check if buckets exist
- ✅ Create buckets if missing

---

### Step 2: Verify Results
After running the SQL, look for this in the results:

```
✅ All buckets exist
```

If you see this, skip to Step 3.

If you see:
```
❌ No buckets found
```
Then the buckets weren't created. **Run Step 1 again** or see "Manual Fix" below.

---

### Step 3: Check lesson_plans Table Columns
Run this in SQL Editor:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'lesson_plans' 
ORDER BY ordinal_position;
```

You should see columns like:
- file_url
- file_name
- file_path
- teacher_id
- ai_generated

If missing, run `COMPLETE_DATABASE_SCHEMA_v2.sql`

---

### Step 4: Test Upload
1. Go back to your app
2. Press **F5** to refresh (hard refresh)
3. Try uploading PDF again
4. Check browser console (F12) for detailed logs

---

## 🔧 IF STILL NOT WORKING

### Manual Bucket Creation (Last Resort)

1. **Go to Supabase → Storage**
2. Click **Create a new bucket**
3. Enter: `lesson-pdfs`
4. Toggle **"Public bucket"** ON ✅
5. Click **Create**
6. **Repeat for these buckets:**
   - worksheets (public)
   - assignment-submissions (private)
   - student-documents (private)
   - profile-photos (public)
   - news-images (public)
   - ilaw-exports (public)
   - temporary-uploads (private)

---

## 🛠️ TROUBLESHOOTING

### If you see: "Bucket not found"
→ Run `VERIFY_AND_FIX_DATABASE.sql` or create buckets manually above

### If you see: "Policy blocking upload"
→ Buckets were created but RLS policies need checking
→ Go to Storage → lesson-pdfs → Policies
→ Make sure there's a policy allowing authenticated uploads

### If you see: "Failed to fetch"
→ Most likely the bucket doesn't exist
→ Follow the "Manual Bucket Creation" section above

---

## 📋 COMPLETE CHECKLIST

- [ ] Updated .env with new database credentials
- [ ] Restarted dev server (Ctrl+C, then npm run dev)
- [ ] Ran COMPLETE_DATABASE_SCHEMA_v2.sql (creates 23 tables)
- [ ] Ran STORAGE_BUCKETS_CONFIGURATION.sql (creates 8 buckets)
- [ ] Verified 8 buckets exist in Supabase Storage
- [ ] Verified lesson_plans table has file_url, file_name, file_path, teacher_id, ai_generated columns
- [ ] Refreshed browser (F5)
- [ ] Tested PDF upload

---

## 💡 WHAT THESE FILES DO

| File | Purpose |
|------|---------|
| VERIFY_AND_FIX_DATABASE.sql | Check what's missing and auto-create buckets |
| COMPLETE_DATABASE_SCHEMA_v2.sql | Create all 23 database tables |
| STORAGE_BUCKETS_CONFIGURATION.sql | Create all 8 storage buckets |

---

## 📞 STILL STUCK?

1. Share a screenshot of your Supabase Storage page
2. Share the console logs from your browser (F12 → Console)
3. Run this SQL and share the results:
```sql
SELECT COUNT(*) as bucket_count FROM storage.buckets;
SELECT name FROM storage.buckets;
```

---

**Let me know when you've run the SQL and what you see!** 🎉
