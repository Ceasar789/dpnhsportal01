// ============================================
// FILE: src/pages/about/About.jsx
// L1: the public About page (/about). Every word comes from aboutContent.js,
// and a section renders only when its field is filled - no placeholder copy,
// no invented numbers. Sections reveal on scroll as progressive enhancement
// (useReveal); the key numbers count up once, with the final value always in
// the markup and the animated copy hidden from screen readers.
// Q4: layout only. Bands alternate white and the page tint, cards and photos
// get the shadow scale from about.css, the gallery tiles all share one 3:2
// crop, and Who can use it sits beside Contact on wide screens.
// ============================================

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import SignInChooser from '../../components/SignInChooser';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Rich } from '../public/Privacy';
import aboutContent from './aboutContent';
import useReveal, { canReveal } from './useReveal';
import './about.css';

export const ABOUT_TITLE = 'About us · Dela Paz National High School';

const NAVY = '#001D4E';
const TEXT = '#334155';
const GOLD_TEXT = '#7E5700';
const FOCUS = 'rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc] focus-visible:ring-offset-2';

const MUTED = '#475569';
const PROSE = 'max-w-[68ch] font-public text-base leading-relaxed break-words sm:text-lg';
const H2 = 'font-work text-2xl font-bold leading-tight sm:text-[28px] lg:text-3xl';
// Every tile is cropped to 3:2. Four photos already are 3:2 and stay centred;
// these two are cropped, and the position keeps the people in the frame.
const PHOTO_POSITION = {
  '/about/turnover-01-crowd.jpg': '50% 80%',
  '/about/turnover-03-ribbon-cutting.jpg': '50% 72%',
};

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
  <section aria-labelledby={id} className={tone === 'navy' ? 'text-white' : 'border-t border-slate-200'}
    style={{ backgroundColor: tone === 'navy' ? '#002a57' : tone === 'white' ? '#FFFFFF' : undefined }}>
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
      <div data-reveal style={stagger(0)}>
        {eyebrow && (
          <p className="mb-2 font-work text-xs font-bold tracking-widest" style={{ color: tone === 'navy' ? '#FEB300' : GOLD_TEXT }}>{eyebrow}</p>
        )}
        <h2 id={id} className={H2} style={{ color: tone === 'navy' ? '#FFFFFF' : NAVY }}>{title}</h2>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  </section>
);

// The reveal moves the outer box; the hover lift moves the inner card, so the
// two transforms never fight. The outer box stretches, so cards in a row match.
const Card = ({ i, className = '', accent = false, children }) => (
  <div data-reveal style={stagger(i)} className={`flex min-w-0 ${className}`}>
    <div className={`about-card about-lift w-full min-w-0 p-5 break-words sm:p-6 ${accent ? 'about-card-accent' : ''}`}>
      {children}
    </div>
  </div>
);

// A section drawn as a card, for the Who can use it | Contact pair.
const Panel = ({ id, title, children }) => (
  <section aria-labelledby={id} className="flex min-w-0">
    <div className="about-card about-lift w-full min-w-0 p-5 break-words sm:p-6 lg:p-8">
      <h2 id={id} data-reveal style={{ ...stagger(0), color: NAVY }} className={H2}>{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  </section>
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
  const photos = c.campus?.photos || [];
  const showCampus = has(c.campus?.paragraphs) || photos.length > 0;
  const nothingYet = !has(c.portalSummary) && !has(c.features) && !has(c.whoCanUse) && !showCampus
    && !showMissionVision && !showStory && !has(c.values) && !has(c.stats);
  // The contact sentence names the email; that part of it is the mailto link.
  const [contactBefore, contactAfter] = has(c.contactLine) && has(c.email) && c.contactLine.includes(c.email)
    ? c.contactLine.split(c.email) : [c.contactLine, null];

  return (
    <div ref={rootRef} className="about-page public-shell min-h-viewport flex flex-col" style={{ backgroundColor: '#F8FAFC' }}>
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
              <div className="mt-6 h-1 w-12" style={{ backgroundColor: '#FEB300' }} aria-hidden="true" />
            </div>
          </div>
        </section>

        {has(c.portalSummary) && (
          <Section id="about-portal" title="About EduScribe" tone="white">
            <p data-reveal className={PROSE} style={{ ...stagger(1), color: TEXT }}>{c.portalSummary}</p>
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

        {has(c.features) && (
          <Section id="about-features" title="What EduScribe does">
            <ul className="grid gap-4 sm:gap-5 md:grid-cols-3 lg:gap-6">
              {c.features.map((group, i) => (
                <li key={group.who} className="flex min-w-0">
                  <Card i={i + 1} className="w-full" accent>
                    <h3 className="font-work text-lg font-bold" style={{ color: NAVY }}>{group.who}</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 font-public text-base leading-relaxed" style={{ color: TEXT }}>
                      {group.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
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

        {showCampus && (
          <Section id="about-campus" title={c.campus.title} tone="white">
            {has(c.campus.paragraphs) && (
              <div className="space-y-4">
                {c.campus.paragraphs.map((p, i) => <p key={p} data-reveal className={PROSE} style={{ ...stagger(i + 1), color: TEXT }}>{p}</p>)}
              </div>
            )}
            {photos.length > 0 && (
              <>
                {/* Identical 3:2 tiles. One column below 460px, two from 460px, three from
                    940px: that keeps every tile at most 443px wide, the width of the
                    narrowest photo (03), so no photo is ever stretched past its own pixels.
                    width and height still hold the space while a photo loads. */}
                <ul className={`grid grid-cols-1 gap-4 min-[460px]:grid-cols-2 sm:gap-5 min-[940px]:grid-cols-3 lg:gap-6 ${has(c.campus.paragraphs) ? 'mt-8' : ''}`}>
                  {photos.map(photo => (
                    <li key={photo.src} className="flex min-w-0">
                      <figure className="about-photo about-lift flex w-full min-w-0 flex-col">
                        <div className="aspect-[3/2] overflow-hidden bg-slate-100">
                          <img src={photo.src} width={photo.width} height={photo.height} alt={photo.caption}
                            loading="lazy" decoding="async" className="block h-full w-full object-cover"
                            style={{ objectPosition: PHOTO_POSITION[photo.src] || '50% 50%' }} />
                        </div>
                        <figcaption className="flex flex-1 flex-col gap-2 p-4 font-public break-words">
                          <span className="about-caption text-[15px] leading-normal" style={{ color: TEXT }}>{photo.caption}</span>
                          {has(photo.source) && <span className="mt-auto block text-[13px] leading-normal" style={{ color: MUTED }}>Source: {photo.source}</span>}
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
                {has(c.campus.credit) && <p className="mt-5 font-public text-sm break-words" style={{ color: MUTED }}>{c.campus.credit}</p>}
              </>
            )}
          </Section>
        )}

        {nothingYet && (
          <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
            <p data-reveal className="font-public text-lg" style={{ color: TEXT }}>More information coming soon.</p>
          </section>
        )}

        {(has(c.whoCanUse) || showContact) && (
          <div className="border-t border-slate-200">
            <div className={`mx-auto grid max-w-[1180px] gap-4 px-4 py-10 sm:gap-5 sm:px-6 sm:py-12 lg:gap-6 lg:py-16 ${has(c.whoCanUse) && showContact ? 'lg:grid-cols-2' : ''}`}>
              {has(c.whoCanUse) && (
                <Panel id="about-who" title="Who can use it">
                  <p data-reveal className="font-public text-base leading-relaxed sm:text-lg" style={{ ...stagger(1), color: TEXT }}><Rich text={c.whoCanUse} /></p>
                </Panel>
              )}

              {showContact && (
                <Panel id="about-contact" title="Contact">
                  {has(c.contactLine) && (
                    <p data-reveal className="mb-6 font-public text-base leading-relaxed break-words sm:text-lg" style={{ ...stagger(1), color: TEXT }}>
                      {contactBefore}
                      {contactAfter !== null && (
                        <><a href={`mailto:${c.email}`} className={`font-semibold underline break-all ${FOCUS}`} style={{ color: '#0062cc' }}>{c.email}</a>{contactAfter}</>
                      )}
                    </p>
                  )}
                  <ul data-reveal style={stagger(1)} className="grid gap-4 sm:grid-cols-2">
                    {has(c.address) && <ContactItem icon={MapPin} label="ADDRESS">{c.address}</ContactItem>}
                    {has(c.mapUrl) && (
                      <ContactItem icon={MapPin} label="MAP">
                        <a href={c.mapUrl} target="_blank" rel="noopener noreferrer" className={LINK_TEXT} style={{ color: '#0062cc' }}>
                          {c.schoolName} on the map{' '}<span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </ContactItem>
                    )}
                    {has(c.email) && contactAfter === null && (
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
                </Panel>
              )}
            </div>
          </div>
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
