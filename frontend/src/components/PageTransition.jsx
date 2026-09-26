// ============================================
// FILE: src/components/PageTransition.jsx
// Wraps routed/tab content so it re-triggers a smooth fade/slide-in
// animation (see .page-transition in src/styles/index.css) every time
// the route or active tab changes.
// ============================================

import { useLocation } from 'react-router-dom';

const PageTransition = ({ children, transitionKey }) => {
  const location = useLocation();
  const key = transitionKey ?? location.pathname;

  return (
    <div key={key} className="page-transition">
      {children}
    </div>
  );
};

export default PageTransition;
