# ✅ FILE UPLOAD FIX CHECKLIST

## BEFORE TRYING TO UPLOAD FILES:

### Database Setup ⚙️
- [ ] Run the SQL migration to add columns to lesson_plans table
- [ ] Run the SQL migration to add columns to worksheets table
- [ ] Verify new columns appear in Supabase Table Editor
- [ ] Verify indexes were created

### Storage Buckets 🪣
- [ ] Create "lesson-pdfs" bucket in Supabase Storage
- [ ] Create "worksheets" bucket in Supabase Storage
- [ ] Set both buckets to "Public"
- [ ] Set up RLS policies to allow public SELECT (read)
- [ ] Set up RLS policies to allow authenticated INSERT (upload)

### Environment Setup 🔑
- [ ] Verify .env file has VITE_SUPABASE_URL
- [ ] Verify .env file has VITE_SUPABASE_ANON_KEY
- [ ] Restart dev server after env changes

### Code Verification ✓
- [ ] Verify TeacherDashboard.jsx has no compile errors
- [ ] Verify handlePdfUpload function is enhanced
- [ ] Verify fetchPlans has logging for debugging

---

## WHEN TRYING TO UPLOAD:

### Upload Testing 🧪
- [ ] Click "Choose PDF file" button
- [ ] Select a PDF from your computer
- [ ] Wait for upload message
- [ ] Check for success toast: "PDF 'filename.pdf' uploaded successfully!"
- [ ] Check F12 console for upload logs

### Display Verification 📋
- [ ] Look for lesson plan card in list
- [ ] Should show "📎 Attached File" section
- [ ] Should show filename
- [ ] Should show "Open file →" link
- [ ] Click link and verify PDF opens in new tab

### Database Verification 💾
- [ ] Go to Supabase Table Editor
- [ ] Open lesson_plans table
- [ ] Find your uploaded lesson plan
- [ ] Verify file_url column has a value (URL)
- [ ] Verify file_name column has a value (filename)

### Storage Verification 📁
- [ ] Go to Supabase Storage
- [ ] Open lesson-pdfs bucket
- [ ] Open your user ID folder
- [ ] Verify your file is there

---

## IF SOMETHING DOESN'T WORK:

### Debug Steps 🔍
1. Open browser Dev Tools (F12)
2. Go to Console tab
3. Try uploading a file
4. Look for error messages
5. Share error message in format: "Error: [specific message]"

### Check Status 📊
```
Browser Console shows:
✅ = Upload successful
❌ = Upload error - share message

Supabase Table Editor shows:
✅ = File data saved
❌ = File not in database

Supabase Storage shows:
✅ = File uploaded to cloud
❌ = File upload failed
```

### Common Fixes 🔧
- Missing columns? Run SQL migration
- Bucket not found? Create buckets
- Permission error? Check bucket is public
- Database error? Check column names match
- Upload fails? Check file size < 50MB

---

## AFTER EVERYTHING WORKS:

### Expected Results ✨
- ✅ PDF uploads to Supabase Storage
- ✅ File displayed with link in lesson plan card
- ✅ File can be opened in new tab
- ✅ File data saved in database
- ✅ File list refreshes automatically
- ✅ Multiple files can be uploaded

### Features Available 🎉
- ✅ Upload Lesson Plan PDF
- ✅ Preview uploaded PDF
- ✅ View uploaded file info
- ✅ Delete uploaded files
- ✅ Edit lesson plan with file
- ✅ Regenerate lesson plan
- ✅ Same for Worksheets feature
- ✅ Same for Assignments feature

---

## 📞 NEED HELP?

If you get stuck:
1. Check all boxes above
2. Try again
3. If error persists:
   - Take screenshot of error
   - Check browser console (F12)
   - Check Supabase logs
   - Check database directly

---

## 🎯 QUICK REFERENCE:

| What | Where | What to Check |
|------|-------|---------------|
| SQL Migration | Supabase SQL Editor | All commands run successfully |
| Buckets | Supabase Storage | lesson-pdfs, worksheets exist |
| Columns | Supabase Table Editor | file_url, file_name columns exist |
| Upload | TeacherDashboard | Success toast appears |
| Display | Lesson Plan Card | "📎 Attached File" section visible |
| File | Supabase Storage | File appears in user folder |
| URL | Database | file_url column has value |

✅ All checked = Everything is working! 🎉
