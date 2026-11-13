// ============================================
// FILE: src/pages/about/About.jsx
// L1: the public About page (/about). Every word comes from aboutContent.js,
// and a section renders only when its field is filled - no placeholder copy,
// no invented numbers. Sections reveal on scroll as progressive enhancement
// (useReveal); the key numbers count up once, with the final value always in
// the markup and the animated copy hidden from screen readers.
// ============================================

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import SignInChooser from '../../components/SignInChooser';
import { useMediaQuery } from '../../lib/useMediaQuery';
import aboutContent from './aboutContent';
import useReveal, { canReveal } from './useReveal';

export const ABOUT_TITLE = 'About us · Dela Paz National High School';

const NAVY = '#001D4E';
const TEXT = '#334155';
const GOLD_TEXT = '#7E5700';
const FOCUS = 'rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc] focus-visible:ring-offset-2';

const has = v => (Array.isArray(v) ? v.length > 0 : Boolean(String(v ?? '').trim()));
const stagger = i => ({ '--reveal-delay': `${Math.min(i, 4) * 80}ms` });

const formatNumber = (n, decimals) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Counts up to `value` once its card is revealed. The final value is what
// React renders; the effect only animates the aria-hidden copy, and leaves
// it on the final value when it stops or unmounts.
export const CountUp = ({ value, suffix = '' }) => {
  const ref = useRef(null);
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  const numeric = String(value).trim() !== '' && Number.isFinite(n);
  const decimals = numeric ? (String(value).split('.')[1]?.length ?? 0) : 0;
  const final = numeric ? formatNumber(n, decimals) : String(value);

  useEffect(() => {
    const el = ref.current;
    if (!numeric || !el || !canReveal()) return undefined;
    const host = el.closest('[data-reveal]');
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / 1200);
        el.textContent = p < 1 ? formatNumber(n * (1 - (1 - p) ** 3), decimals) : final;
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    el.textContent = formatNumber(0, decimals);
    if (!host || host.classList.contains('is-in')) run();
    else host.addEventListener('reveal', run, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      host?.removeEventListener('reveal', run);
      el.textContent = final;
    };
  }, [numeric, n, decimals, final]);

  return (
    <>
      <span aria-hidden="true" className="tabular-nums"><span key={final} ref={ref}>{final}</span>{suffix}</span>
      <span className="sr-only">{final}{suffix}</span>
    </>
  );
};

const Section = ({ id, eyebrow, title, children, tone = 'light' }) => (
  <section aria-labelledby={id} className={tone === 'navy' ? 'text-white' : ''}
    style={{ backgroundColor: tone === 'navy' ? '#002a57' : tone === 'white' ? '#FFFFFF' : undefined }}>
    <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 lg:py-20">
      <div data-reveal style={stagger(0)}>
        {eyebrow && (
          <p className="font-work text-xs font-bold tracking-widest" style={{ color: tone === 'navy' ? '#FEB300' : GOLD_TEXT }}>{eyebrow}</p>
        )}
        <h2 id={id} className="mt-2 font-work text-2xl font-bold leading-tight sm:text-3xl" style={{ color: tone === 'navy' ? '#FFFFFF' : NAVY }}>{title}</h2>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  </section>
);

const Card = ({ i, className = '', children }) => (
  <div data-reveal style={stagger(i)} className={`min-w-0 rounded-lg bg-white p-6 shadow-sm ring-1 ring-black/5 break-words ${className}`}>
    {children}
  </div>
);

const ContactItem = ({ icon: Icon, label, children }) => (
  <li className="flex min-w-0 items-start gap-3">
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#EEF2F8' }}>
      <Icon size={18} color={NAVY} aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <p className="font-work text-xs font-bold tracking-widest" style={{ color: GOLD_TEXT }}>{label}</p>
      <div className="mt-1 font-public text-base break-words" style={{ color: TEXT }}>{children}</div>
    </div>
  </li>
);

const LINK_TEXT = `inline-flex min-h-11 items-center font-semibold underline ${FOCUS}`;

const About = ({ content = aboutContent }) => {
  const rootRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 1099.98px)');
  useReveal(rootRef);

  useEffect(() => {
    const previous = document.title;
    document.title = ABOUT_TITLE;
    return () => { document.title = previous; };
  }, []);

  const c = content;
  const vision = [].concat(c.vision || []).filter(has);
  const showMissionVision = has(c.mission) || vision.length > 0;
  const showStory = has(c.story) || has(c.timeline);
  const showContact = [c.email, c.mapUrl, c.facebookUrl, c.phone, c.address, c.officeHours].some(has);
  const nothingYet = !showMissionVision && !showStory && !has(c.values) && !has(c.stats);

  return (
    <div ref={rootRef} className="public-shell min-h-viewport flex flex-col" style={{ backgroundColor: '#F8FAFC' }}>
      <PublicHeader isMobile={isMobile} active="About" />

      <main className="flex-1" style={{ paddingTop: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop }}>
        {/* Hero banner */}
        <section className="relative overflow-hidden text-white"
          style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div className="absolute inset-0" aria-hidden="true"
            style={{ background: 'linear-gradient(to right, rgba(0,29,78,0.92) 0%, rgba(0,29,78,0.78) 55%, rgba(0,29,78,0.62) 100%)' }} />
          <div className="relative mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:pb-24 lg:pt-10">
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded font-work text-sm font-semibold text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] focus-visible:ring-offset-2 focus-visible:ring-offset-[#001D4E]">
              <ArrowLeft size={16} aria-hidden="true" /> Back to home
            </Link>
            <div data-reveal className="mt-8 max-w-3xl lg:mt-14">
              <p className="font-work text-xs font-bold tracking-widest" style={{ color: '#FEB300' }}>ABOUT US</p>
              <h1 className="mt-3 font-work text-[32px] font-bold leading-tight tracking-tight sm:text-[44px] lg:text-[56px]" style={{ letterSpacing: '-0.02em' }}>
                {c.schoolName}
              </h1>
              {has(c.tagline) && <p className="mt-5 max-w-2xl font-public text-lg leading-relaxed text-white/90">{c.tagline}</p>}
              <div className="mt-6 h-1 w-12" style={{ backgroundColor: '#FEB300' }} aria-hidden="true" />
            </div>
          </div>
        </section>

        {has(c.portalSummary) && (
          <Section id="about-portal" eyebrow="THE PORTAL" title="EduScribe" tone="white">
            <p data-reveal className="max-w-3xl font-public text-lg leading-relaxed" style={{ ...stagger(1), color: TEXT }}>{c.portalSummary}</p>
          </Section>
        )}

        {showMissionVision && (
          <Section id="about-mission" eyebrow="WHAT GUIDES US" title={has(c.mission) && vision.length ? 'Mission and Vision' : has(c.mission) ? 'Our Mission' : 'Our Vision'}>
            <div className={`grid gap-6 ${has(c.mission) && vision.length ? 'md:grid-cols-2' : 'max-w-3xl'}`}>
              {has(c.mission) && (
                <Card i={1}>
                  <h3 className="font-work text-xs font-bold tracking-widest" style={{ color: GOLD_TEXT }}>OUR MISSION</h3>
                  <p className="mt-4 font-public text-lg leading-relaxed" style={{ color: TEXT }}>{c.mission}</p>
                </Card>
              )}
              {vision.length > 0 && (
                <Card i={2}>
                  <h3 className="font-work text-xs font-bold tracking-widest" style={{ color: GOLD_TEXT }}>OUR VISION</h3>
                  {vision.map(p => <p key={p} className="mt-4 font-public text-lg leading-relaxed" style={{ color: TEXT }}>{p}</p>)}
                  <div className="mt-6 h-1 w-12" style={{ backgroundColor: '#FEB300' }} aria-hidden="true" />
                </Card>
              )}
            </div>
          </Section>
        )}

        {showStory && (
          <Section id="about-story" eyebrow="OUR STORY" title="Our Story" tone="white">
            {has(c.story) && (
              <div className="max-w-3xl space-y-4">
                {c.story.map((p, i) => <p key={p} data-reveal className="font-public text-lg leading-relaxed break-words" style={{ ...stagger(i + 1), color: TEXT }}>{p}</p>)}
              </div>
            )}
            {has(c.timeline) && (
              <ol className={`relative max-w-3xl border-l-2 pl-6 ${has(c.story) ? 'mt-10' : ''}`} style={{ borderColor: '#FEB300' }}>
                {c.timeline.map((item, i) => (
                  <li key={`${item.year}-${item.title}`} data-reveal style={stagger(i + 1)} className="relative pb-8 last:pb-0 break-words">
                    <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-white" style={{ backgroundColor: '#FEB300' }} aria-hidden="true" />
                    {has(item.year) && <p className="font-work text-sm font-bold" style={{ color: GOLD_TEXT }}>{item.year}</p>}
                    {has(item.title) && <h3 className="mt-1 font-work text-lg font-bold" style={{ color: NAVY }}>{item.title}</h3>}
                    {has(item.text) && <p className="mt-1 font-public text-base leading-relaxed" style={{ color: TEXT }}>{item.text}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {has(c.values) && (
          <Section id="about-values" eyebrow="WHAT WE VALUE" title="Core Values">
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.values.map((v, i) => (
                <li key={v.title} className="flex">
                  <Card i={i + 1} className="w-full">
                    <h3 className="font-work text-lg font-bold" style={{ color: NAVY }}>{v.title}</h3>
                    {has(v.text) && <p className="mt-2 font-public text-base leading-relaxed" style={{ color: TEXT }}>{v.text}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {has(c.stats) && (
          <Section id="about-numbers" eyebrow="AT A GLANCE" title="Key Numbers" tone="navy">
            <ul className="grid grid-cols-1 gap-6 min-[420px]:grid-cols-2 lg:grid-cols-4">
              {c.stats.map((s, i) => (
                <li key={s.label} data-reveal className="min-w-0 rounded-lg p-6 break-words" style={{ ...stagger(i + 1), backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="font-work text-4xl font-bold lg:text-5xl" style={{ color: '#FEB300' }}><CountUp value={s.value} suffix={s.suffix || ''} /></p>
                  <p className="mt-2 font-public text-base text-white/90">{s.label}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {nothingYet && (
          <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
            <p data-reveal className="font-public text-lg" style={{ color: TEXT }}>More information coming soon.</p>
          </section>
        )}

        {showContact && (
          <Section id="about-contact" eyebrow="GET IN TOUCH" title="Contact and Location" tone="white">
            <ul data-reveal style={stagger(1)} className="grid max-w-4xl gap-6 sm:grid-cols-2">
              {has(c.address) && <ContactItem icon={MapPin} label="ADDRESS">{c.address}</ContactItem>}
              {has(c.mapUrl) && (
                <ContactItem icon={MapPin} label="MAP">
                  <a href={c.mapUrl} target="_blank" rel="noopener noreferrer" className={LINK_TEXT} style={{ color: '#0062cc' }}>
                    {c.schoolName} on the map{' '}<span className="sr-only">(opens in a new tab)</span>
                  </a>
                </ContactItem>
              )}
              {has(c.email) && (
                <ContactItem icon={Mail} label="EMAIL">
                  <a href={`mailto:${c.email}`} className={`${LINK_TEXT} break-all`} style={{ color: '#0062cc' }}>{c.email}</a>
                </ContactItem>
              )}
              {has(c.phone) && (
                <ContactItem icon={Phone} label="PHONE">
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className={LINK_TEXT} style={{ color: '#0062cc' }}>{c.phone}</a>
                </ContactItem>
              )}
              {has(c.officeHours) && <ContactItem icon={Clock} label="OFFICE HOURS">{c.officeHours}</ContactItem>}
              {has(c.facebookUrl) && (
                <ContactItem icon={Facebook} label="FACEBOOK">
                  <a href={c.facebookUrl} target="_blank" rel="noopener noreferrer" className={LINK_TEXT} style={{ color: '#0062cc' }}>
                    Dela Paz NHS on Facebook{' '}<span className="sr-only">(opens in a new tab)</span>
                  </a>
                </ContactItem>
              )}
            </ul>
          </Section>
        )}

        {/* Sign in */}
        <section aria-labelledby="about-signin" style={{ backgroundColor: NAVY }}>
          <div data-reveal className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-14 sm:px-6 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between">
            <h2 id="about-signin" className="font-work text-2xl font-bold text-white sm:text-3xl">Sign in to EduScribe</h2>
            <SignInChooser width={isMobile ? '100%' : '250px'} />
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default About;
