// ============================================
// FILE: src/pages/profile/ProfileTab.jsx
// PURPOSE: Personal information tab — view/edit profile + upload photo.
// Rendered INSIDE each dashboard's own shell/theme (not a standalone page),
// so it reads the shared --bg/--card-bg/--border/--text/--accent CSS vars
// (falling back to sensible light-theme values for a dashboard that
// doesn't define them, e.g. Faculty).
// ============================================

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { roleLabel } from '../dashboards/admin/shared/helpers';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';
import Avatar from '../../components/Avatar';
import { Camera, Lock } from 'lucide-react';

const PHOTO_CHANGE_LIMIT = 3;
const PHOTO_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const v = (name, fallback) => `var(${name}, ${fallback})`;

const ProfileTab = () => {
  const navigate = useNavigate();
  const { userData, updateProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [name, setName] = useState(userData?.profile?.name || userData?.name || '');
  const [phone, setPhone] = useState(userData?.profile?.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(userData?.profile?.date_of_birth || '');
  const [address, setAddress] = useState(userData?.profile?.address || '');
  const [bio, setBio] = useState(userData?.profile?.bio || '');

  const storedPhotoPath = userData?.profile?.photo_url || '';
  const signedPhotoUrl = useSignedPhotoUrl(storedPhotoPath);
  const [photoFile, setPhotoFile] = useState(null);
  const [localPreview, setLocalPreview] = useState('');
  const displayedPhoto = localPreview || signedPhotoUrl;

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // ── 3 changes / rolling 7-day window (mirrors the DB trigger; the
  // trigger is what actually enforces it, this is just for UX) ──────────
  const windowStart = userData?.profile?.photo_change_window_start
    ? new Date(userData.profile.photo_change_window_start)
    : null;
  const withinWindow = windowStart && (Date.now() - windowStart.getTime() < PHOTO_CHANGE_WINDOW_MS);
  const changesUsed = withinWindow ? (userData?.profile?.photo_change_count || 0) : 0;
  const changesRemaining = Math.max(0, PHOTO_CHANGE_LIMIT - changesUsed);
  const photoLimitReached = withinWindow && changesUsed >= PHOTO_CHANGE_LIMIT;
  const resetDate = withinWindow ? new Date(windowStart.getTime() + PHOTO_CHANGE_WINDOW_MS) : null;

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file'); setIsSuccess(false);
      return;
    }
    setPhotoFile(file);
    setLocalPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    try {
      let photoPath = storedPhotoPath;

      if (photoFile) {
        const filePath = `${userData?.uid || 'user'}/${Date.now()}-${photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        const { error: uploadError } = await supabase.storage
          .from('profile-photos')
          .upload(filePath, photoFile, { cacheControl: '3600', upsert: true });
        if (uploadError) throw uploadError;
        photoPath = filePath;
      }

      await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        date_of_birth: dateOfBirth || null,
        address: address.trim(),
        bio: bio.trim(),
        photo_url: photoPath,
      });

      setPhotoFile(null);
      setLocalPreview('');
      setIsSuccess(true);
      setMessage('Profile updated successfully!');
    } catch (error) {
      setIsSuccess(false);
      setMessage(
        error.message?.includes('Photo change limit')
          ? error.message
          : (error.message || 'Failed to update profile. Please try again.')
      );
    } finally {
      setIsSaving(false);
    }
  };

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
      <div style={{ fontSize: 22, fontWeight: 700, color: v('--text', '#1a2b4a') }}>Profile Settings</div>
      <div style={{ color: v('--text-muted', '#64748b'), fontSize: 13, marginTop: 3, marginBottom: 20 }}>
        Manage your personal information and profile photo
      </div>

      {message && (
        <div className="flex items-start gap-2 p-3 rounded-md mb-5"
          style={{ backgroundColor: isSuccess ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>
          <span className="text-lg">{isSuccess ? '✅' : '⚠'}</span>
          <p className="text-sm flex-1" style={{ color: isSuccess ? v('--green', '#16a34a') : v('--red', '#dc2626') }}>{message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-stretch">
        {/* ── Left: photo + identity summary ───────────────────────── */}
        <div style={{ ...cardStyle, borderRadius: 12, padding: 28 }} className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar src={displayedPhoto} name={name || 'User'} size={112} />
            <button
              type="button"
              onClick={() => !photoLimitReached && fileInputRef.current?.click()}
              disabled={photoLimitReached}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: v('--accent', '#1908DF'), border: `2px solid ${v('--card-bg', '#ffffff')}` }}
              aria-label="Change profile photo"
            >
              <Camera size={15} color="#ffffff" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} disabled={photoLimitReached} />
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

          <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle}>FULL NAME</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle}>PHONE NUMBER</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XX XXX XXXX"
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle}>DATE OF BIRTH</label>
                <input type="date" value={dateOfBirth || ''} onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle}>ADDRESS</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Barangay, City"
                className="w-full h-11 px-4 rounded-md text-sm outline-none focus:ring-2"
                style={inputStyle} />
            </div>

            <div className="flex flex-col flex-1">
              <label className="block text-xs font-semibold tracking-widest mb-2" style={labelStyle}>ABOUT ME</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio..."
                className="w-full flex-1 min-h-[120px] px-4 py-3 rounded-md text-sm outline-none focus:ring-2 resize-none"
                style={inputStyle} />
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={isSaving}
                className="px-8 h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: v('--accent', '#1908DF') }}>
                {isSaving
                  ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
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
