// ============================================
// FILE: src/components/FlippingLogo.jsx
// Coin-flip logo: the EduScribe brand mark on the front, the original school
// seal on the back, flipping sideways on the Y axis so both stay in use.
// Timing lives in the .eduscribe-flip rules in src/styles/index.css.
// ============================================

import React from 'react';

// `size` sets a fixed pixel box. Omit it and pass Tailwind sizing in
// `className` instead when the logo needs to be responsive.
const FlippingLogo = ({ size, className = '', alt = 'EduScribe' }) => (
  <div
    className={`eduscribe-flip ${className}`}
    style={size ? { width: size, height: size } : undefined}
  >
    <div className="eduscribe-flip-inner">
      <img
        src="/EduScribeLogoIcon.png"
        alt={alt}
        className="eduscribe-flip-face"
        onError={(e) => { e.target.style.visibility = 'hidden'; }}
      />
      <img
        src="/capstonelogo.png"
        alt=""
        aria-hidden="true"
        className="eduscribe-flip-face eduscribe-flip-back"
        onError={(e) => { e.target.style.visibility = 'hidden'; }}
      />
    </div>
  </div>
);

export default FlippingLogo;
