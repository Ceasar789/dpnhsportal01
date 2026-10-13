// ============================================
// FILE: src/pages/profile/ProfileTab.jsx
// PURPOSE: Personal information tab — view/edit profile + upload photo.
// Rendered INSIDE each dashboard's own shell/theme (not a standalone page),
// so it reads the shared --bg/--card-bg/--border/--text/--accent CSS vars
// (falling back to sensible light-theme values for a dashboard that
// doesn't define them, e.g. Faculty).
// ============================================

import { useCallback, useContext, useEffect, useState, useRef } from 'react';
import { UNSAFE_DataRouterContext, useBlocker, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../context/ProfileUnsavedChangesContext';
import { supabase } from '../../config/supabase';
import { roleLabel } from '../dashboards/admin/shared/helpers';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';
import Avatar from '../../components/Avatar';
import Modal from '../../components/ui/Modal';
import { Camera, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';

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

const ProfileTab = () => {
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
      await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        date_of_birth: dateOfBirth || null,
        address: address.trim(),
        bio: bio.trim(),
        photo_url: photoPath,
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

  const cardStyle = {
    backgroundColor: v('--card-bg', '#ffffff'),
    border: `1px solid ${v('--border', '#e2e8f0')}`,
  };
  const inputStyle = {
    backgroundColor: v('--bg', '#f8fafc'),
    border: `1px solid ${v('--border', '#e2e8f0')}`,
    color: v('--text', '#1a2b4a'),
  };
  const labelStyle = { color: v('--text-muted', '#64748b') };

  return (
    <div className="w-full p-6">
      {dataRouter && (
        <ProfileRouteBlocker
          when={isDirty || isSaving}
          onBlocked={handleRouteBlocked}
        />
      )}

      <Modal
        open={Boolean(pendingLeave)}
        title={pendingLeave?.saveInProgress ? 'Profile save in progress' : 'Discard unsaved changes?'}
        onClose={cancelLeave}
        isDirty={() => false}
        overlayStyle={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: 'rgba(15,23,42,0.62)',
        }}
        cardStyle={{
          width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)',
          padding: 24, borderRadius: 12, background: v('--card-bg', '#ffffff'),
          border: `1px solid ${v('--border', '#e2e8f0')}`, color: v('--text', '#1a2b4a'),
          boxShadow: '0 20px 50px rgba(15,23,42,0.24)',
        }}
        titleStyle={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: v('--text', '#1a2b4a') }}
        footerStyle={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}
        footer={(requestClose) => pendingLeave?.saveInProgress ? (
          <button type="button" onClick={requestClose} className="h-11 px-5 rounded-md font-semibold"
            style={{ color: v('--text', '#1a2b4a'), border: `1px solid ${v('--border', '#e2e8f0')}`, background: v('--card2', '#f1f5f9') }}>
            Stay on Profile
          </button>
        ) : (
          <>
            <button type="button" onClick={requestClose} className="h-11 px-5 rounded-md font-semibold"
              style={{ color: v('--text', '#1a2b4a'), border: `1px solid ${v('--border', '#e2e8f0')}`, background: v('--card2', '#f1f5f9') }}>
              Keep Editing
            </button>
            <button type="button" onClick={confirmLeave} className="h-11 px-5 rounded-md font-semibold text-white"
              style={{ background: v('--accent', '#1908DF') }}>
              Discard and Leave
            </button>
          </>
        )}
      >
        <p style={{ color: v('--text-muted', '#64748b'), lineHeight: 1.6, fontSize: 14 }}>
          {pendingLeave?.saveInProgress
            ? 'Wait for the current save to finish before leaving this page.'
            : 'Leaving now will discard the Profile changes you have not saved.'}
        </p>
      </Modal>

      <div style={{ fontSize: 22, fontWeight: 700, color: v('--text', '#1a2b4a') }}>Profile Settings</div>
      <div style={{ color: v('--text-muted', '#64748b'), fontSize: 13, marginTop: 3, marginBottom: 20 }}>
        Manage your personal information and profile photo
      </div>

      {message && (
        <div id="profile-status-message" role={messageTone === 'error' ? 'alert' : 'status'} aria-live={messageTone === 'error' ? 'assertive' : 'polite'}
          className="flex items-start gap-2 p-3 rounded-md mb-5"
          style={{ backgroundColor: messageTone === 'success' ? 'rgba(34,197,94,0.12)' : messageTone === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)' }}>
          {messageTone === 'success'
            ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
            : <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <p className="text-sm flex-1" style={{ color: messageTone === 'success' ? v('--green', '#16a34a') : messageTone === 'warning' ? v('--yellow', '#b45309') : v('--red', '#dc2626') }}>{message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-stretch">
        {/* ── Left: photo + identity summary ───────────────────────── */}
        <div style={{ ...cardStyle, borderRadius: 12, padding: 28 }} className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar src={displayedPhoto} name={name || 'User'} size={112} />
            <button
              type="button"
              onClick={() => !photoLimitReached && !isSaving && fileInputRef.current?.click()}
              disabled={photoLimitReached || isSaving}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: v('--accent', '#1908DF'), border: `2px solid ${v('--card-bg', '#ffffff')}` }}
              aria-label="Change profile photo"
              aria-controls="profile-photo-input"
              aria-describedby={messageTarget === 'photo' ? 'profile-status-message' : undefined}
            >
              <Camera size={15} color="#ffffff" />
            </button>
            <label className="sr-only" htmlFor="profile-photo-input">Choose profile photo</label>
            <input id="profile-photo-input" ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick}
              disabled={photoLimitReached || isSaving} aria-describedby={messageTarget === 'photo' ? 'profile-status-message' : undefined} />
          </div>

          <div style={{ fontSize: 18, fontWeight: 700, color: v('--text', '#1a2b4a'), marginTop: 18 }}>{name || 'User'}</div>
          <div style={{ fontSize: 12, color: v('--text-muted', '#64748b'), marginTop: 2 }}>{roleLabel(userData?.role)}</div>

          {photoLimitReached ? (
            <p className="text-xs mt-4" style={{ color: v('--red', '#dc2626') }}>
              Photo change limit reached ({PHOTO_CHANGE_LIMIT} per 7 days).<br />
              Try again on {resetDate?.toLocaleDateString()}.
            </p>
          ) : (
            <p className="text-xs mt-4" style={labelStyle}>
              {changesRemaining} of {PHOTO_CHANGE_LIMIT} photo changes left this week
            </p>
          )}

          <div style={{ width: '100%', borderTop: `1px solid ${v('--border', '#e2e8f0')}`, margin: '22px 0' }} />

          <div className="w-full flex flex-col gap-3 text-left">
            <div className="flex items-center justify-between text-sm">
              <span style={labelStyle}>Email</span>
              <span style={{ color: v('--text', '#1a2b4a'), fontWeight: 600, fontSize: 13 }}>{userData?.email}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={labelStyle}>Status</span>
              <span style={{ color: v('--green', '#16a34a'), fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{userData?.status || 'active'}</span>
            </div>
            {userData?.profile?.department && (
              <div className="flex items-center justify-between text-sm">
                <span style={labelStyle}>Department</span>
                <span style={{ color: v('--text', '#1a2b4a'), fontWeight: 600, fontSize: 13 }}>{userData.profile.department}</span>
              </div>
            )}
          </div>

          <div style={{ width: '100%', borderTop: `1px solid ${v('--border', '#e2e8f0')}`, margin: '22px 0' }} />

          <button onClick={() => navigate('/change-password')} className="flex items-center justify-center gap-1.5 text-sm font-medium w-full mt-auto" style={{ color: v('--accent', '#1908DF') }}>
            <Lock size={14} />
            Change Password
          </button>
        </div>

        {/* ── Right: editable details ──────────────────────────────── */}
        <div style={{ ...cardStyle, borderRadius: 12, padding: 32 }} className="flex flex-col">
          <div style={{ fontSize: 14, fontWeight: 700, color: v('--text', '#1a2b4a'), marginBottom: 4 }}>Personal Information</div>
          <div style={{ fontSize: 12, color: v('--text-muted', '#64748b'), marginBottom: 20 }}>These details are only visible to you and the administrator.</div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1" aria-busy={isSaving || undefined}>
            {isDirty && (
              <div role="status" className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-md"
                style={{ background: v('--card2', '#f1f5f9'), border: `1px solid ${v('--border', '#e2e8f0')}` }}>
                <span className="text-sm font-medium" style={{ color: v('--text-muted', '#64748b') }}>You have unsaved Profile changes.</span>
                <button type="button" onClick={() => discardChanges(true)} disabled={isSaving}
                  className="min-h-11 px-4 rounded-md text-sm font-semibold"
                  style={{ color: v('--accent', '#1908DF'), border: `1px solid ${v('--border', '#e2e8f0')}`, background: v('--card-bg', '#ffffff') }}>
                  Discard
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle} htmlFor="profile-full-name">FULL NAME</label>
                <input id="profile-full-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSaving}
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle} htmlFor="profile-phone">PHONE NUMBER</label>
                <input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XX XXX XXXX" disabled={isSaving}
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle} htmlFor="profile-date-of-birth">DATE OF BIRTH</label>
                <input id="profile-date-of-birth" type="date" value={dateOfBirth || ''} onChange={(e) => setDateOfBirth(e.target.value)} disabled={isSaving}
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle} htmlFor="profile-address">ADDRESS</label>
              <input id="profile-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Barangay, City" disabled={isSaving}
                className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                style={inputStyle} />
            </div>

            <div className="flex flex-col flex-1">
              <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle} htmlFor="profile-bio">ABOUT ME</label>
              <textarea id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio..." disabled={isSaving}
                className="w-full flex-1 min-h-[120px] px-4 py-3 rounded-md text-sm outline-none focus:ring-2 resize-none"
                style={inputStyle} />
            </div>

            <div className="flex justify-end flex-wrap gap-3">
              <button type="submit" disabled={isSaving}
                className="px-8 h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: v('--accent', '#1908DF') }}>
                {isSaving
                  ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Saving profile</span></div>
                  : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileTab;
