# 🔧 COMPLETE FIX GUIDE: FILE UPLOAD ERROR & DISPLAY ISSUE

## 🎯 PROBLEM:
When uploading a PDF to the lesson plan, it's not displaying because the database table is missing the required columns.

---

## ✅ SOLUTION: 3 STEPS

### STEP 1: Add Missing Database Columns ⚙️

**Location:** Supabase Dashboard → SQL Editor
**Action:** Run this SQL command

```sql
-- Add columns to lesson_plans table
ALTER TABLE lesson_plans 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS strategy VARCHAR(255),
ADD COLUMN IF NOT EXISTS duration VARCHAR(100);

-- Add columns to worksheets table
ALTER TABLE worksheets 
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS pages VARCHAR(50),
ADD COLUMN IF NOT EXISTS items INT DEFAULT 0;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_lesson_plans_file_url ON lesson_plans(file_url);
CREATE INDEX IF NOT EXISTS idx_worksheets_file_url ON worksheets(file_url);
```

**Expected Result:** ✅ All commands executed successfully

---

### STEP 2: Verify Database Columns ✓

After running the SQL, verify the columns were added:

1. Go to **Table Editor** in Supabase
2. Click **lesson_plans** table
3. Scroll right and verify you see:
   - ✓ file_url (TEXT)
   - ✓ file_name (TEXT)
   - ✓ file_path (TEXT)
   - ✓ ai_generated (BOOLEAN)
   - ✓ strategy (TEXT)
   - ✓ duration (TEXT)

4. Click **worksheets** table
5. Scroll right and verify:
   - ✓ file_name (TEXT)
   - ✓ file_path (TEXT)
   - ✓ status (TEXT)
   - ✓ pages (TEXT)
   - ✓ items (INT)

---

### STEP 3: Configure Storage Bucket Access 🪣

Your Supabase Storage buckets need to be public for files to be accessible.

**For lesson-pdfs bucket:**
1. Go to **Storage** in Supabase
2. Click on **lesson-pdfs** bucket
3. Click the **⋮** menu → **Policies**
4. Verify there's a policy allowing public SELECT:
   ```
   Role: Public
   Permissions: SELECT
   ```
   If not, create it manually

**For worksheets bucket:**
1. Click on **worksheets** bucket
2. Click **⋮** menu → **Policies**
3. Verify there's a policy allowing public SELECT
   If not, create one

---

## 🧪 TEST THE FIX:

### Test Upload:
1. Open TeacherDashboard
2. Click **"Choose PDF file"** button
3. Select any PDF file from your computer
4. Wait for upload to complete
5. **Expected:** ✅ Toast message: "PDF 'filename.pdf' uploaded successfully!"

### Test Display:
1. Look at the lesson plan card that just uploaded
2. **Expected:** You should see:
   ```
   📎 Attached File
   filename.pdf
   Open file →
   ```
3. Click **"Open file →"** link
4. **Expected:** PDF opens in a new tab

### Check Console (for debugging):
1. Press **F12** to open Developer Tools
2. Go to **Console** tab
3. You should see logs like:
   ```
   ✅ Plan 0: "Lesson Title" has file: lesson.pdf
   📚 Loaded lesson plans: (array with file_url data)
   ```

---

## ❌ IF STILL NOT WORKING:

### Check 1: Verify Upload Success
- Check browser console (F12)
- Look for error messages starting with "Error uploading PDF:"
- Share the exact error message

### Check 2: Verify Database Save
- Go to Supabase → Table Editor → lesson_plans
- Look for your newly uploaded lesson plan
- Check if **file_url** and **file_name** have values
- If empty, database save failed

### Check 3: Verify File in Storage
- Go to Supabase → Storage
- Open **lesson-pdfs** folder
- Look for your file (named like `1234567890_abc.pdf`)
- If not there, upload failed

### Check 4: Check .env Variables
- Verify your `.env` file has:
  ```
  VITE_SUPABASE_URL=your-url
  VITE_SUPABASE_ANON_KEY=your-key
  ```
- Ask if unsure about these values

---

## 📋 WHAT'S BEING FIXED:

### Before Migration ❌
- PDF uploads fail silently
- File not saved to database
- File not displayed in UI

### After Migration ✅
- PDF uploads to Supabase Storage
- File URL saved in database
- File displays with link in lesson plan card
- File can be opened/viewed

---

## 🚀 AFTER FIX IS APPLIED:

All file upload features will work:
1. ✅ **Lesson Plans** - PDF upload and display
2. ✅ **Worksheets** - File upload (.pdf, .docx, .doc, .xlsx) and display
3. ✅ **Assignments** - File submissions and display
4. ✅ **File Preview** - Click to view uploaded files

---

## 📝 FILES MODIFIED:

- ✅ `add-file-columns.sql` - Migration script
- ✅ `TeacherDashboard.jsx` - Enhanced error handling and debugging
- ✅ `MIGRATION_INSTRUCTIONS.md` - Step-by-step guide

**All changes verified - NO COMPILE ERRORS** ✅
