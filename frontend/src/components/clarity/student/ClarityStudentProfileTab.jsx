// ============================================
// FILE: src/components/clarity/student/ClarityStudentProfileTab.jsx
// Student Profile Settings in Clarity ("Option A"): the student's identity
// card on the left (photo, the 3-per-week photo rule, name, email, LRN when
// the school has recorded one, the stored account status) and, on the right,
// Personal information (the same fields, Discard and Save Changes) and a
// Password card (the same Change Password route).
//
// TEMPORARY word-for-word copies from pages/profile/ProfileTab.jsx, which
// Admin and Teacher share and which stays unchanged (source-parity tested in
// ClarityStudentProfileTab.test.jsx); after the defense they should share them:
//   - the constants and helpers, :22-90
//   - the state, effects and handlers, :93-377
// One declared substitution: the classic component's `teacherView` prop is
// the constant `false` here (this tab is for students only).
//
// LRN: read from the student data the dashboard already loads
// (StudentDataContext -> studentTaskGraph.js:128, students.lrn). No new read.
// ============================================

import { useCallback, useContext, useEffect, useState, useRef } from 'react';
import { UNSAFE_DataRouterContext, useBlocker, useNavigate } from 'react-router-dom';
import { Camera, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import { supabase } from '../../../config/supabase';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import Avatar from '../../Avatar';
import Modal from '../../ui/Modal';
import { viewportHeight } from '../../../lib/viewportHeight';

// ---- TEMPORARY copy (ProfileTab.jsx:22-90) ----
const PHOTO_CHANGE_LIMIT = 3;
const PHOTO_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_PHOTO_BUCKET = 'profile-photos';

const v = (name, fallback) => `var(${name}, ${fallback})`;

const textValue = (value) => value == null ? '' : String(value);

const profileSnapshot = (userData) => ({
  name: textValue(userData?.profile?.name ?? userData?.name).trim(),
  phone: textValue(userData?.profile?.phone).trim(),
  dateOfBirth: textValue(userData?.profile?.date_of_birth),
  address: textValue(userData?.profile?.address).trim(),
  bio: textValue(userData?.profile?.bio).trim(),
  photoPath: textValue(userData?.profile?.photo_url),
});

const sameEditableValues = (left, right) => (
  left.name.trim() === right.name
  && left.phone.trim() === right.phone
  && textValue(left.dateOfBirth) === textValue(right.dateOfBirth)
  && left.address.trim() === right.address
  && left.bio.trim() === right.bio
);

const ProfileRouteBlocker = ({ when, onBlocked }) => {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (blocker.state === 'blocked') onBlocked(blocker);
  }, [blocker, onBlocked]);

  return null;
};

// Only paths produced by this screen are eligible for automatic replacement
// cleanup. Older URLs and ambiguous legacy paths stay untouched.
const isOwnedProfilePhotoPath = (path, userId) => {
  if (typeof path !== 'string' || !userId || path.includes('://') || path.includes('\\')) return false;
  const parts = path.split('/');
  if (parts.length !== 2 || parts[0] !== userId) return false;
  return /^\d+-[a-zA-Z0-9._-]+$/.test(parts[1]) && !parts[1].includes('..');
};

const safePhotoFileName = (name) => {
  const safe = String(name || 'profile-photo')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/\.{2,}/g, '.');
  return safe || 'profile-photo';
};

const profileFailureMessage = (error, stage, cleanupFailed) => {
  const raw = String(error?.message || '');
  let message;

  if (/photo change limit/i.test(raw)) {
    message = 'Photo change limit reached (3 changes per 7 days). Please wait until the current window resets.';
  } else if (/not authenticated|session|jwt|refresh token/i.test(raw)) {
    message = 'Your session expired. Sign in again, then retry your profile update.';
  } else if (stage === 'upload') {
    message = 'The new profile photo could not be uploaded. Please try again.';
  } else {
    message = 'Your profile could not be updated. Please try again.';
  }

  return cleanupFailed
    ? `${message} The uploaded file also could not be removed automatically.`
    : message;
};
// ---- end of the copy ----

// A stored value only: no assumed default.
const stored = value => String(value ?? '').trim();
const titleCase = text => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const ClarityStudentProfileTab = () => {
  // Declared substitution: the classic `teacherView` prop (students only).
  const teacherView = false;
  // ---- TEMPORARY copy (ProfileTab.jsx:93-377) ----
  const navigate = useNavigate();
  const { userData, updateProfile } = useAuth();
  const { registerProfileGuard } = useProfileUnsavedChanges();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const fileInputRef = useRef(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const initialSnapshot = profileSnapshot(userData);
  const [baseline, setBaseline] = useState(initialSnapshot);
  const [baselineUserId, setBaselineUserId] = useState(userData?.uid || userData?.id || null);

  const [name, setName] = useState(initialSnapshot.name);
  const [phone, setPhone] = useState(initialSnapshot.phone);
  const [dateOfBirth, setDateOfBirth] = useState(initialSnapshot.dateOfBirth);
  const [address, setAddress] = useState(initialSnapshot.address);
  const [bio, setBio] = useState(initialSnapshot.bio);

  const storedPhotoPath = userData?.profile?.photo_url || '';
  const signedPhotoUrl = useSignedPhotoUrl(storedPhotoPath);
  const [photoFile, setPhotoFile] = useState(null);
  const [localPreview, setLocalPreview] = useState('');
  const displayedPhoto = localPreview || signedPhotoUrl;

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('error');
  const [messageTarget, setMessageTarget] = useState(null);
  const [currentWindowTime, setCurrentWindowTime] = useState(() => Date.now());
  const [pendingLeave, setPendingLeave] = useState(null);

  const editableValues = { name, phone, dateOfBirth, address, bio };
  const textDirty = !sameEditableValues(editableValues, baseline);
  const isDirty = textDirty || Boolean(photoFile);

  const discardChanges = useCallback((announce = true) => {
    const saved = baseline;
    setName(saved.name);
    setPhone(saved.phone);
    setDateOfBirth(saved.dateOfBirth);
    setAddress(saved.address);
    setBio(saved.bio);
    setPhotoFile(null);
    setLocalPreview('');
    setMessageTarget(null);
    if (announce) {
      setMessageTone('success');
      setMessage('Unsaved changes discarded.');
    } else {
      setMessage('');
    }
  }, [baseline]);

  const requestLeave = useCallback((action) => {
    setPendingLeave({
      proceed: action,
      cancel: null,
      saveInProgress: savingRef.current,
    });
  }, []);

  useEffect(() => registerProfileGuard({
    shouldBlock: () => isDirty || savingRef.current,
    requestLeave,
  }), [isDirty, registerProfileGuard, requestLeave]);

  useEffect(() => {
    if (!isDirty && !isSaving) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, isSaving]);

  useEffect(() => {
    if (!pendingLeave?.saveInProgress || isSaving) return;
    pendingLeave.cancel?.();
    // The blocked attempt is cancelled after the active save settles; the
    // user can then choose a destination again from the now-clean form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingLeave(null);
  }, [isSaving, pendingLeave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // React runs this cleanup before replacing the preview and on unmount. It
  // only ever sees blob URLs created by this component, never signed URLs.
  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const authoritativeSnapshot = profileSnapshot(userData);
  const authoritativeKey = JSON.stringify(authoritativeSnapshot);
  const currentUserId = userData?.uid || userData?.id || null;

  useEffect(() => {
    const accountChanged = baselineUserId !== currentUserId;
    if (!accountChanged && (savingRef.current || isDirty)) return;

    const saved = JSON.parse(authoritativeKey);
    // This effect synchronizes an external AuthContext refresh into a clean
    // local form. Dirty forms deliberately keep their user-entered values.
    setBaseline(saved);
    setBaselineUserId(currentUserId);
    setName(saved.name);
    setPhone(saved.phone);
    setDateOfBirth(saved.dateOfBirth);
    setAddress(saved.address);
    setBio(saved.bio);
    setPhotoFile(null);
    setLocalPreview('');
  }, [authoritativeKey, baselineUserId, currentUserId, isDirty]);

  // ── 3 changes / rolling 7-day window (mirrors the DB trigger; the
  // trigger is what actually enforces it, this is just for UX) ──────────
  const photoWindowStart = userData?.profile?.photo_change_window_start;
  const windowStart = photoWindowStart
    ? new Date(photoWindowStart)
    : null;

  useEffect(() => {
    if (!photoWindowStart) return undefined;
    const resetAt = new Date(photoWindowStart).getTime() + PHOTO_CHANGE_WINDOW_MS;
    const remaining = resetAt - Date.now();
    if (remaining <= 0) return undefined;

    const timer = window.setTimeout(() => setCurrentWindowTime(Date.now()), remaining + 50);
    return () => window.clearTimeout(timer);
  }, [photoWindowStart]);

  const withinWindow = windowStart && (currentWindowTime - windowStart.getTime() < PHOTO_CHANGE_WINDOW_MS);
  const changesUsed = withinWindow ? (userData?.profile?.photo_change_count || 0) : 0;
  const changesRemaining = Math.max(0, PHOTO_CHANGE_LIMIT - changesUsed);
  const photoLimitReached = withinWindow && changesUsed >= PHOTO_CHANGE_LIMIT;
  const resetDate = withinWindow ? new Date(windowStart.getTime() + PHOTO_CHANGE_WINDOW_MS) : null;

  const handlePhotoPick = (e) => {
    if (savingRef.current) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file.');
      setMessageTone('error');
      setMessageTarget('photo');
      e.target.value = '';
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotoFile(file);
    setLocalPreview(preview);
    setMessage('');
    setMessageTarget(null);
    // Let choosing the same file again produce another change event.
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;

    const userId = userData?.uid || userData?.id;
    const selectedPhoto = photoFile;
    const previousPhotoPath = storedPhotoPath;
    let uploadedPath = null;
    let stage = 'profile';

    if (selectedPhoto && !userId) {
      setMessage('Your session expired. Sign in again, then retry your profile update.');
      setMessageTone('error');
      setMessageTarget('photo');
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setMessage('');
    setMessageTarget(null);
    try {
      let photoPath = previousPhotoPath;

      if (selectedPhoto) {
        stage = 'upload';
        const filePath = `${userId}/${Date.now()}-${safePhotoFileName(selectedPhoto.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_PHOTO_BUCKET)
          .upload(filePath, selectedPhoto, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = filePath;
        photoPath = filePath;
      }

      stage = 'profile';
      await updateProfile(teacherView
        ? { name: name.trim(), photo_url: photoPath }
        : {
          name: name.trim(), phone: phone.trim(), date_of_birth: dateOfBirth || null,
          address: address.trim(), bio: bio.trim(), photo_url: photoPath,
        });

      let oldPhotoCleanupFailed = false;
      if (uploadedPath && previousPhotoPath && previousPhotoPath !== uploadedPath) {
        if (isOwnedProfilePhotoPath(previousPhotoPath, userId)) {
          try {
            const { error: removeError } = await supabase.storage
              .from(PROFILE_PHOTO_BUCKET)
              .remove([previousPhotoPath]);
            oldPhotoCleanupFailed = Boolean(removeError);
          } catch {
            oldPhotoCleanupFailed = true;
          }
          if (oldPhotoCleanupFailed) {
            console.warn('The previous profile photo could not be removed automatically.');
          }
        } else {
          console.warn('Skipped automatic cleanup for an unverified previous profile-photo reference.');
        }
      }

      if (mountedRef.current) {
        setBaseline({
          name: name.trim(),
          phone: phone.trim(),
          dateOfBirth: dateOfBirth || '',
          address: address.trim(),
          bio: bio.trim(),
          photoPath,
        });
        setPhotoFile(null);
        setLocalPreview('');
        setMessageTone(oldPhotoCleanupFailed ? 'warning' : 'success');
        setMessage(oldPhotoCleanupFailed
          ? 'Profile updated successfully. The previous photo could not be removed automatically.'
          : 'Profile updated successfully!');
      }
    } catch (error) {
      let rollbackCleanupFailed = false;
      if (uploadedPath) {
        try {
          const { error: removeError } = await supabase.storage
            .from(PROFILE_PHOTO_BUCKET)
            .remove([uploadedPath]);
          rollbackCleanupFailed = Boolean(removeError);
        } catch {
          rollbackCleanupFailed = true;
        }
        if (rollbackCleanupFailed) {
          console.warn('A failed profile update left its newly uploaded photo pending cleanup.');
        }
      }

      if (mountedRef.current) {
        setMessageTone('error');
        setMessageTarget(selectedPhoto ? 'photo' : null);
        setMessage(profileFailureMessage(error, stage, rollbackCleanupFailed));
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const handleRouteBlocked = useCallback((blocker) => {
    setPendingLeave((current) => current || {
      proceed: blocker.proceed,
      cancel: blocker.reset,
      saveInProgress: savingRef.current,
    });
  }, []);

  const cancelLeave = useCallback(() => {
    pendingLeave?.cancel?.();
    setPendingLeave(null);
  }, [pendingLeave]);

  const confirmLeave = useCallback(() => {
    if (!pendingLeave || pendingLeave.saveInProgress) return;
    const proceed = pendingLeave.proceed;
    discardChanges(false);
    setPendingLeave(null);
    proceed();
  }, [discardChanges, pendingLeave]);
  // ---- end of the copy ----

  const { graph } = useStudentData();
  const lrn = stored(graph?.studentRecord?.lrn);
  const status = stored(userData?.status);
  const email = stored(userData?.email);

  return (
    <div className="x-sprof">
      {dataRouter && (
        <ProfileRouteBlocker
          when={isDirty || isSaving}
          onBlocked={handleRouteBlocked}
        />
      )}

      {/* The classic leave dialog: same titles, text and buttons, Clarity colours. */}
      <Modal
        open={Boolean(pendingLeave)}
        title={pendingLeave?.saveInProgress ? 'Profile save in progress' : 'Discard unsaved changes?'}
        onClose={cancelLeave}
        isDirty={() => false}
        overlayStyle={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: 'rgba(10,16,32,.45)',
        }}
        cardStyle={{
          width: 'min(440px, calc(100vw - 32px))', maxHeight: `calc(${viewportHeight(100)} - 32px)`,
          padding: 24, borderRadius: 16, background: v('--cl-card', '#ffffff'),
          border: `1px solid ${v('--cl-bd', '#e7e9f1')}`, color: v('--cl-tx', '#0f162b'),
          boxShadow: '0 30px 80px rgba(10,16,32,.35)',
        }}
        titleStyle={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: v('--cl-tx', '#0f162b') }}
        footerStyle={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}
        footer={(requestClose) => pendingLeave?.saveInProgress ? (
          <button type="button" onClick={requestClose} className="x-btn">Stay on Profile</button>
        ) : (
          <>
            <button type="button" onClick={requestClose} className="x-btn">Keep Editing</button>
            <button type="button" onClick={confirmLeave} className="x-btn pri">Discard and Leave</button>
          </>
        )}
      >
        <p className="x-cs">
          {pendingLeave?.saveInProgress
            ? 'Wait for the current save to finish before leaving this page.'
            : 'Leaving now will discard the Profile changes you have not saved.'}
        </p>
      </Modal>

      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Profile Settings</h1>
          <p className="x-sub">Your student profile. Your LRN and email are managed by your school.</p>
        </div>
      </div>

      {message && (
        <div id="profile-status-message" role={messageTone === 'error' ? 'alert' : 'status'} aria-live={messageTone === 'error' ? 'assertive' : 'polite'}
          className={`x-sprof-msg ${messageTone}`}>
          {messageTone === 'success'
            ? <CheckCircle2 size={18} aria-hidden="true" />
            : <AlertTriangle size={18} aria-hidden="true" />}
          <p>{message}</p>
        </div>
      )}

      <div className="x-sprof-layout">
        <section className="x-card x-sprof-id" aria-label="Your profile">
          <Avatar src={displayedPhoto} name={name || 'User'} size={96} />
          <label className="x-sr" htmlFor="profile-photo-input">Choose profile photo</label>
          <input id="profile-photo-input" ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoPick}
            disabled={photoLimitReached || isSaving} aria-describedby={messageTarget === 'photo' ? 'profile-status-message' : undefined} />
          <button
            type="button"
            className="x-btn"
            onClick={() => !photoLimitReached && !isSaving && fileInputRef.current?.click()}
            disabled={photoLimitReached || isSaving}
            aria-label="Change profile photo"
            aria-controls="profile-photo-input"
            aria-describedby={messageTarget === 'photo' ? 'profile-status-message' : undefined}
          >
            <Camera size={16} aria-hidden="true" /> Change photo
          </button>
          {photoLimitReached ? (
            <p className="x-sprof-rule over">
              Photo change limit reached ({PHOTO_CHANGE_LIMIT} per 7 days).<br />
              Try again on {resetDate?.toLocaleDateString()}.
            </p>
          ) : (
            <p className="x-sprof-rule">
              {changesRemaining} of {PHOTO_CHANGE_LIMIT} photo changes left this week
            </p>
          )}
          <h2 className="x-sprof-name">{name || 'User'}</h2>
          {email && <p className="x-sprof-email">{email}</p>}
          {lrn && (
            <div className="x-sprof-lrn">
              <span>LRN</span>
              <b>{lrn}</b>
            </div>
          )}
          {status && <span className={`x-badge${status.toLowerCase() === 'active' ? ' ok' : ''}`}>{titleCase(status)}</span>}
        </section>

        <div className="x-sprof-main">
          <section className="x-card x-pad" aria-labelledby="x-sprof-info">
            <h2 id="x-sprof-info" className="x-ct">Personal information</h2>
            <p className="x-cs">These details are only visible to you and the administrator.</p>

            <form onSubmit={handleSubmit} className="x-sprof-form" aria-busy={isSaving || undefined}>
              {isDirty && (
                <div role="status" className="x-sprof-dirty">
                  <span>You have unsaved Profile changes.</span>
                  <button type="button" className="x-btn" onClick={() => discardChanges(true)} disabled={isSaving}>Discard</button>
                </div>
              )}
              <div className="x-sprof-grid">
                <div className="x-field">
                  <label className="x-label" htmlFor="profile-full-name">Full name</label>
                  <input id="profile-full-name" className="x-input" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSaving} />
                </div>
                <div className="x-field">
                  <label className="x-label" htmlFor="profile-date-of-birth">Date of birth</label>
                  <input id="profile-date-of-birth" className="x-input" type="date" value={dateOfBirth || ''} onChange={(e) => setDateOfBirth(e.target.value)} disabled={isSaving} />
                </div>
                <div className="x-field">
                  <label className="x-label" htmlFor="profile-phone">Phone</label>
                  <input id="profile-phone" className="x-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XX XXX XXXX" disabled={isSaving} />
                </div>
                <div className="x-field">
                  <label className="x-label" htmlFor="profile-email">Email <span className="x-sprof-note">managed by school</span></label>
                  <input id="profile-email" className="x-input" value={email} readOnly aria-readonly="true" />
                </div>
                <div className="x-field x-sprof-wide">
                  <label className="x-label" htmlFor="profile-address">Address</label>
                  <input id="profile-address" className="x-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Barangay, City" disabled={isSaving} />
                </div>
                <div className="x-field x-sprof-wide">
                  <label className="x-label" htmlFor="profile-bio">About me</label>
                  <textarea id="profile-bio" className="x-input x-sprof-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio..." disabled={isSaving} />
                </div>
              </div>
              <div className="x-sprof-act">
                <button type="submit" className="x-btn pri" disabled={isSaving}>
                  {isSaving ? <span>Saving…<span className="x-sr"> profile</span></span> : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>

          <section className="x-card x-pad x-sprof-pw" aria-labelledby="x-sprof-password">
            <div>
              <h2 id="x-sprof-password" className="x-ct">Password</h2>
              <p className="x-cs">Change the password you use to sign in.</p>
            </div>
            <button type="button" className="x-btn" onClick={() => navigate('/change-password')}>
              <Lock size={16} aria-hidden="true" /> Change Password
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ClarityStudentProfileTab;
