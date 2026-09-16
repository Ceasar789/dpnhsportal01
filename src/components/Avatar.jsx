// ============================================
// FILE: src/components/Avatar.jsx
// Shared avatar: shows the user's uploaded photo when present, otherwise
// falls back to an initials circle (same look every dashboard already had).
// ============================================

import { useState, useEffect } from 'react';
import { initials, avatarColor } from '../pages/dashboards/admin/shared/helpers';

const Avatar = ({ src, name = 'User', size = 36, bg, color = '#ffffff', className = '', style = {}, ...rest }) => {
  const [failed, setFailed] = useState(false);

  // Reset the broken-image flag whenever a new src comes in (e.g. the
  // signed URL finished resolving, or the photo was just replaced).
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size, ...style }}
        {...rest}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: bg || avatarColor(name),
        color,
        fontSize: Math.max(10, Math.round(size * 0.32)),
        ...style,
      }}
      {...rest}
    >
      {initials(name)}
    </div>
  );
};

export default Avatar;
