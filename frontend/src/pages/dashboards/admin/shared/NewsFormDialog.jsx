// ============================================
// FILE: src/pages/dashboards/admin/shared/NewsFormDialog.jsx
// U4: New / Edit / View Published Post on the form kit. One component for
// the classic NewsTab and the Clarity ClarityAdminNewsTab. Data and saving
// are unchanged (useAdminLogic.saveNews / saveNewsExpiry).
//   - "Title required" and "Custom audience required" were toasts only; they
//     are now messages on their fields (blur and submit)
//   - a published post is read-only except its expiry (as before)
//   - the image preview is unchanged: a staged file shows as a blob URL made
//     and revoked in an effect, the saved image as its stored URL
// ============================================

import { useEffect, useRef } from 'react';
import Field from '../../../../components/ui/form/Field';
import { useAdminContext } from '../AdminContext';
import { TARGET_ROLES } from './helpers';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { LIMITS, NEWS_FIELDS, newsRules, validateNewsForm } from './adminForms';

const NEWS_CATEGORIES = ['Academics', 'Events', 'Scholarships', 'Announcements', 'Sports'];

function NewsForm() {
  const {
    closeModal, editNews, nAuthor = '', nCat = '', nContent = '', nCustomTarget = '', nExpiresDate = '', nImageFile = null,
    nImageUrl = '', nSaving = false, nStatus = 'Draft', nTarget = '', nTitle = '', newsReadOnly = false,
    saveNews, saveNewsExpiry, setNAuthor, setNCat, setNContent, setNExpiresDate, setNStatus,
    setNCustomTarget, setNImageFile, setNTarget, setNTitle,
  } = useAdminContext();
  const form = useFormDialog(Object.values(NEWS_FIELDS));
  const editing = Boolean(editNews);

  // The blob belongs to the visible preview: made in an effect so every one
  // is revoked, including on replacement and on close.
  const previewImageRef = useRef(null);
  useEffect(() => {
    if (!nImageFile || !previewImageRef.current) return undefined;
    const url = URL.createObjectURL(nImageFile);
    previewImageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [nImageFile]);

  // The file input is uncontrolled: clearing the state is not enough, the
  // element keeps showing the filename until its own value is reset.
  const imageInputRef = useRef(null);
  const clearStagedImage = () => {
    setNImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const submit = newsReadOnly
    ? () => form.submit([], saveNewsExpiry)
    : () => form.submit(validateNewsForm({ title: nTitle, target: nTarget, custom: nCustomTarget }), saveNews);

  const primaryLabel = newsReadOnly ? 'Save expiry'
    : editing ? 'Save changes'
      : nStatus === 'Published' ? 'Publish' : 'Save draft';

  return (
    <FormDialog
      title={newsReadOnly ? 'View Published Post' : editing ? 'Edit Post' : 'New Post'}
      onClose={closeModal}
      summaryId="news-form-summary"
      form={form}
      primaryLabel={primaryLabel}
      busyLabel="Saving…"
      saving={nSaving}
      onSubmit={submit}
    >
      {newsReadOnly && (
        <p className="fk-help" style={{ margin: '0 0 16px' }}>
          A published post&apos;s content is locked so it can&apos;t be quietly rewritten. You can still change or clear its expiry date below.
        </p>
      )}
      <Field label="Title" id={NEWS_FIELDS.title} optional={newsReadOnly} error={form.fieldError(NEWS_FIELDS.title)}
        validate={newsReadOnly ? undefined : newsRules.title} onValidate={form.clearError(NEWS_FIELDS.title)}>
        <input value={nTitle} onChange={e => setNTitle(e.target.value)} maxLength={LIMITS.title} disabled={newsReadOnly} autoComplete="off" />
      </Field>
      <Field label="Category" id={NEWS_FIELDS.category}>
        <select value={nCat} onChange={e => setNCat(e.target.value)} disabled={newsReadOnly}>
          {NEWS_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Target audience" id={NEWS_FIELDS.target}>
        <select value={nTarget} onChange={e => setNTarget(e.target.value)} disabled={newsReadOnly}>
          {TARGET_ROLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          {/* An old post's audience the app no longer offers stays selected
              (and is saved unchanged). It cannot be chosen for a new post. */}
          {nTarget && !TARGET_ROLES.some(t => t.value === nTarget) && (
            <option value={nTarget} disabled>{`${nTarget} (no longer offered)`}</option>
          )}
        </select>
      </Field>
      {nTarget === 'custom' && (
        <Field label="Custom audience" id={NEWS_FIELDS.custom} help="For example, Grade 10 students or Science Department."
          error={form.fieldError(NEWS_FIELDS.custom)} validate={newsReadOnly ? undefined : newsRules.custom}
          onValidate={form.clearError(NEWS_FIELDS.custom)}>
          <input value={nCustomTarget} onChange={e => setNCustomTarget(e.target.value)} disabled={newsReadOnly} autoComplete="off" />
        </Field>
      )}
      <Field label="Author" id={NEWS_FIELDS.author} optional>
        <input value={nAuthor} onChange={e => setNAuthor(e.target.value)} disabled={newsReadOnly} autoComplete="name" />
      </Field>
      <Field label="Content" id={NEWS_FIELDS.content} optional>
        <textarea rows={5} value={nContent} onChange={e => setNContent(e.target.value)} disabled={newsReadOnly} />
      </Field>
      <Field label="Attach image" id={NEWS_FIELDS.image} optional>
        <input ref={imageInputRef} type="file" accept="image/*"
          onChange={e => setNImageFile(e.target.files?.[0] || null)} disabled={newsReadOnly} />
      </Field>
      {(nImageFile || nImageUrl) && (
        <div className="news-image-preview">
          <img
            ref={previewImageRef}
            src={nImageFile ? undefined : nImageUrl}
            alt={nImageFile ? `Chosen image: ${nImageFile.name || 'the chosen image'}` : 'The image currently on this post'}
          />
          <div className="news-image-preview-bar">
            <span className="news-image-preview-label">
              {nImageFile ? `${nImageFile?.name || 'New image'} — not saved yet` : 'Current image'}
            </span>
            {nImageFile && !newsReadOnly && (
              <button type="button" className="news-action" onClick={clearStagedImage}>
                {nImageUrl ? 'Keep current' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      )}
      <Field label="Status" id={NEWS_FIELDS.status}>
        <select value={nStatus} onChange={e => setNStatus(e.target.value)} disabled={newsReadOnly}>
          <option>Draft</option><option>Published</option>
        </select>
      </Field>
      {/* Expiry is a visibility control, not content: it stays editable
          even on a locked, already-published post. */}
      <Field label="Expires on" id={NEWS_FIELDS.expires} optional help="The post stops showing after this date.">
        <input type="date" value={nExpiresDate} onChange={e => setNExpiresDate(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function NewsFormDialog() {
  const { modal } = useAdminContext();
  return modal === 'news' ? <NewsForm /> : null;
}
