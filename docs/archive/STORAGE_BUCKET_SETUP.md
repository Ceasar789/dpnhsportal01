# 🪣 SUPABASE STORAGE BUCKET SETUP GUIDE

## REQUIRED BUCKETS FOR FILE UPLOADS:

### 1. lesson-pdfs bucket
- For uploading PDF lesson plans
- Stores files in: `{userId}/{timestamp}_{random}.pdf`

### 2. worksheets bucket  
- For uploading worksheets (PDF, DOCX, DOC, XLSX)
- Stores files in: `{userId}/{timestamp}_{random}.{ext}`

---

## ✅ CREATE BUCKETS (if they don't exist):

### In Supabase Dashboard:

1. Go to **Storage** section
2. Click **"Create a new bucket"** button
3. **For lesson-pdfs:**
   - Bucket name: `lesson-pdfs`
   - ✓ Check "Public bucket" 
   - Click **"Create bucket"**

4. **For worksheets:**
   - Bucket name: `worksheets`
   - ✓ Check "Public bucket"
   - Click **"Create bucket"**

---

## 🔐 STORAGE POLICIES (RLS):

### For lesson-pdfs bucket:

**Public Read Policy (allow anyone to view files):**
1. Click **lesson-pdfs** bucket
2. Click **⋮** menu → **Policies**
3. Click **"New policy"** → **For SELECT**
4. Choose **"Public"**
5. Click **"Review"** → **"Save policy"**

**User Upload Policy (allow authenticated users to upload):**
1. Click **"New policy"** → **For INSERT**
2. Choose **"Authenticated user uploads"** template
3. Or manually set:
   - Effect: ALLOW
   - For: Authenticated users
   - Where: `(bucket_id = 'lesson-pdfs')`
4. Click **"Save policy"**

### For worksheets bucket:

Do the same as above for the worksheets bucket.

---

## 🧪 TEST STORAGE ACCESS:

### Upload Test:
1. Go to TeacherDashboard
2. Click **"Choose PDF file"**
3. Upload a test PDF
4. **Should succeed** ✅

### View Storage Files:
1. Go to Supabase → **Storage**
2. Click **lesson-pdfs** bucket
3. Click your **user ID folder**
4. **Should see your uploaded file** ✅

### Access Public URL:
1. In Storage, find your uploaded file
2. Click the **⋮** menu → **"Share"**
3. Copy the **public URL**
4. Open in browser
5. **Should view the PDF** ✅

---

## ❌ COMMON ISSUES:

| Issue | Solution |
|-------|----------|
| Upload fails silently | Verify bucket exists and is public |
| File uploads but not visible | Check bucket is set to "Public" |
| Cannot view file | Verify RLS policies allow PUBLIC SELECT |
| 403 Permission error | Enable public bucket or adjust policies |
| Bucket not found error | Create bucket first using instructions above |

---

## 📋 BUCKET STRUCTURE:

After uploading files, storage will look like:
```
lesson-pdfs/
├── {userId}/
│   ├── 1234567890_abc.pdf
│   ├── 1234567891_def.pdf
│   └── 1234567892_ghi.pdf
└── {userId2}/
    └── 1234567893_jkl.pdf

worksheets/
├── {userId}/
│   ├── 1234567890_abc.pdf
│   ├── 1234567891_def.docx
│   └── 1234567892_ghi.xlsx
└── {userId2}/
    └── 1234567893_jkl.doc
```

---

## ✨ AFTER SETUP:

All file operations will work:
- ✅ Upload files to storage
- ✅ Get public URLs
- ✅ Store URLs in database
- ✅ Display files in UI
- ✅ Open/view files in browser
- ✅ Delete files from storage
