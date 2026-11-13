// ============================================
// FILE: src/components/ui/Skeleton.jsx
// L2: shared skeleton loading shapes. Every shape is decoration: it sits in
// an aria-hidden group (data-skeleton) with no text of its own. The loading
// state's own role="status" element keeps its exact text, visually hidden,
// so screen readers and tests read the same words as before. Styles live in
// styles/skeleton.css (tokens when present, neutral fallbacks elsewhere).
// ============================================

import '../../styles/skeleton.css';

const size = v => (typeof v === 'number' ? `${v}px` : v);

/** One block. `r` overrides the corner radius (default 10px, the control radius); `inline` sits it in a line of text. */
export const Skeleton = ({ w = '100%', h = 12, r, inline = false, className = '', style }) => (
  <span className={`sk-b${inline ? ' sk-inline' : ''} ${className}`.trim()} style={{ width: size(w), height: size(h), ...(inline ? { '--sk-h': size(h) } : {}), ...(r !== undefined ? { '--sk-r': size(r) } : {}), ...style }} />
);

/** Lines of text: full width, the last one shorter. */
export const SkeletonText = ({ lines = 1, last = '60%', h = 12, className = '' }) => (
  <span className={`sk-lines ${className}`.trim()}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} h={h} w={i === lines - 1 && lines > 1 ? last : '100%'} />
    ))}
  </span>
);

export const SkeletonCircle = ({ size: d = 40, className = '' }) => (
  <Skeleton w={d} h={d} className={`sk-round ${className}`.trim()} style={{ flexShrink: 0 }} />
);

/** A progress ring stands in as a circle of the ring's size. */
export const SkeletonRing = SkeletonCircle;

/** A card: optional media block, a title, `lines` of text and `actions` buttons. Pass the real card classes. */
export const SkeletonCard = ({ lines = 2, media = 0, actions = 0, className = '', titleWidth = '70%' }) => (
  <div className={`sk-card ${className}`.trim()}>
    {media ? <Skeleton h={media} r="var(--cl-r, 12px)" /> : null}
    <Skeleton h={16} w={titleWidth} />
    {lines > 0 && <SkeletonText lines={lines} />}
    {actions > 0 && (
      <span className="sk-card-act">
        {Array.from({ length: actions }, (_, i) => <Skeleton key={i} h={40} w={`${Math.floor(100 / actions) - 2}%`} />)}
      </span>
    )}
  </div>
);

/** List rows: a title line and a detail line, and an optional pill on the right. */
export const SkeletonRows = ({ count = 3, trailing = 'none', pills = 1, className = '' }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`sk-row ${className}`.trim()}>
        <SkeletonText lines={2} last="40%" />
        {trailing === 'pill' && Array.from({ length: pills }, (_, p) => <Skeleton key={p} w={64} h={24} className="sk-round" style={{ flexShrink: 0 }} />)}
      </div>
    ))}
  </>
);

/** Table rows for an existing <tbody>: each row aria-hidden, one line-high bar per cell (or `cell(c)` for a custom cell). */
export const SkeletonTable = ({ rows = 5, cols = 4, widths = [], cell }) => (
  <>
    {Array.from({ length: rows }, (_, r) => (
      <tr key={r} aria-hidden="true" data-skeleton="" className="sk-in">
        {Array.from({ length: cols }, (_, c) => (
          <td key={c} className="sk-td">{cell?.(c) ?? <Skeleton inline h="0.8em" w={widths[c] || '80%'} />}</td>
        ))}
      </tr>
    ))}
  </>
);

/** A KPI tile: label, value, caption. Pass the real tile classes. */
export const SkeletonStat = ({ className = '' }) => (
  <div className={`sk-stat ${className}`.trim()}>
    <Skeleton h={12} w="50%" />
    <Skeleton h={28} w="40%" />
    <Skeleton h={12} w="70%" />
  </div>
);

/** The wrapper every skeleton sits in: hidden from assistive tech, marked for e2e waits. */
export const SkeletonGroup = ({ as: Tag = 'div', className = '', children, style }) => (
  <Tag aria-hidden="true" data-skeleton="" className={`sk-in ${className}`.trim()} style={style}>{children}</Tag>
);
