// ============================================
// FILE: src/components/FlippingLogo.jsx
// The EduScribe logo, static (N1). It used to coin-flip between the
// EduScribe mark and the school seal; it now shows only the EduScribe mark,
// in the same box. The name and path stay so existing imports and test
// mocks keep working. Styles: .eduscribe-logo in src/styles/index.css.
// ============================================

// `size` sets a fixed pixel box. Omit it and pass Tailwind sizing in
// `className` instead when the logo needs to be responsive.
const FlippingLogo = ({ size, className = '', alt = 'EduScribe' }) => (
  <div
    className={`eduscribe-logo ${className}`}
    style={size ? { width: size, height: size } : undefined}
  >
    <img
      src="/EduScribeLogoIcon.png"
      alt={alt}
      className="eduscribe-logo-img"
      onError={(e) => { e.target.style.visibility = 'hidden'; }}
    />
  </div>
);

export default FlippingLogo;
