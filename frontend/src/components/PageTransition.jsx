// ============================================
// FILE: src/components/PageTransition.jsx
// Wraps routed/tab content so it re-triggers a smooth fade/slide-in
// animation (see .page-transition in src/styles/index.css) every time
// the route or active tab changes.
// ============================================

import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PageTransition = ({ children, transitionKey }) => {
  const location = useLocation();
  const key = transitionKey ?? location.pathname;

  // Without this a route change kept the old scroll offset, so leaving a
  // scrolled /news for /calendar opened the calendar halfway down itself. It
  // jumps rather than scrolls: an animated scroll on navigation fights the
  // fade-in, and it is motion nobody asked for.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  return (
    <div key={key} className="page-transition">
      {children}
    </div>
  );
};

export default PageTransition;
