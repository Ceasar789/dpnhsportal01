# UI/UX Audit — EduScribe

2026-09-26. Measured against the code, not eyeballed: contrast ratios are
computed with the WCAG 2.1 formula, control sizes read from the CSS, counts
from grep across `frontend/src`.

Every finding was then cross-checked against the guideline database in the
`ui-ux-pro-max` Claude Code plugin. It confirmed findings 1, 2, 4, 5 and 6
independently, and **corrected finding 3** — see the note there on 24×24
versus 44×44.

## What is already right

Worth saying first, because the findings below are all one narrow class of
problem and it would be easy to read them as "the design is bad".

The design is **consistent**, which is the hard part and the thing that
usually goes wrong when a UI grows screen by screen. One navy (`#1a2b4a`),
one accent (`#1908DF`), one card treatment, one table treatment, one badge
shape. Light and dark are driven by CSS variables rather than duplicated
styles, so a theme change is one edit rather than forty.

The information design is also sound. Stat cards lead with the number.
Empty states say what is missing and what to do. Failures are distinguished
from emptiness — "Could not load" with a Retry, never a silent zero — which
is a discipline most production apps do not have.

What follows is almost entirely **accessibility**, and accessibility is the
one area that cannot be judged by looking, because the person it fails is
not the person testing it.

---

## 1. Contrast — nine of seventeen colour pairs fail

The most serious finding, and the easiest to fix.

| Pair | Now | Needs | Verdict |
| --- | --- | --- | --- |
| Muted text on a light card | 2.56:1 | 4.5:1 | **fail** |
| Muted text on a dark card | 3.07:1 | 4.5:1 | **fail** |
| Upload hint, light | **1.48:1** | 4.5:1 | **fail** |
| Upload hint, dark | 2.36:1 | 4.5:1 | **fail** |
| "Could not generate" heading | 3.44:1 | 4.5:1 | **fail** |
| Green status badge | 3.30:1 | 4.5:1 | **fail** |
| Amber status badge | 3.19:1 | 4.5:1 | **fail** |
| Notification count on red | 3.76:1 | 4.5:1 | **fail** |
| Grade tab, inactive, dark | 3.75:1 | 4.5:1 | **fail** |
| Body text, both themes | 13–14:1 | 4.5:1 | pass |
| Accent links | 9.81:1 | 4.5:1 | pass |
| Subject chips | 6.18:1 | 4.5:1 | pass |
| Error body text | 7.6–9.1:1 | 4.5:1 | pass |
| White on the navy header | 11.01:1 | 4.5:1 | pass |

`1.48:1` is the "Max 3MB · PDF only" line under the upload button. That is
very close to invisible — not "subtle", genuinely hard to read for anyone,
and unreadable on a projector or in sunlight. Your panel will be looking at
a projector.

### The cause is one mistake, repeated

The muted greys are **the wrong way round**. On light backgrounds the code
uses the lighter grey; on dark backgrounds it uses the darker one. Each is
the shade that should be on the other side.

| Where | Now | Should be | Then |
| --- | --- | --- | --- |
| Muted on light | `#94a3b8` | `#64748b` | 4.76:1 |
| Muted on dark | `#64748b` | `#94a3b8` | 5.71:1 |
| Hint on light | `#cbd5e1` | `#64748b` | 4.76:1 |
| Hint on dark | `#475569` | `#94a3b8` | 6.96:1 |
| Error heading | `#ef4444` | `#b91c1c` | 5.91:1 |
| Green badge | `#16a34a` | `#15803d` | 5.02:1 |
| Amber badge | `#d97706` | `#b45309` | 5.02:1 |

These are all Tailwind ramp shades one or two steps along, so nothing
changes character — the greys stay grey, the green stays green. They just
become legible.

**Scale:** `text-xs` appears 208 times and `text-sm` 340 times across the
dashboards, and most of the muted-grey usage sits on those. This is not a
handful of labels.

---

## 2. Focus rings removed in about thirty places with nothing in their place

`outline: none` or `outline-none` appears 66 times. 37 of those pair it with
a `focus:ring` or `:focus` replacement. **The rest simply delete the focus
indicator.**

For anyone navigating by keyboard — which includes every user of a screen
reader, and anyone whose mouse is not working — that is the cursor
disappearing. They can still tab through the form, they just cannot see
where they are.

The fix is one global rule rather than 29 individual ones:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

`:focus-visible` rather than `:focus` so a mouse click does not leave a ring
behind — which is why the rings were being removed in the first place.

---

## 3. Touch targets below the WCAG minimum

The web minimum is **24×24 CSS px** — WCAG 2.2 AA, criterion 2.5.8. The
44×44 figure quoted everywhere is Apple's iOS guidance (Android says 48dp),
and it is AAA on the web, not AA. Measured against the right rule:

| Control | Size | Verdict |
| --- | --- | --- |
| `.chip-x` — remove a saved teaching load | **12×12** | **fail** |
| `.chip-x` — remove from the staging list | **13×13** | **fail** |
| `.btn-sm` | ~22–26px tall | borderline |
| `.icon-action` (delete, edit) | 32×32 | pass AA |

`.icon-action` passes; it only misses the AAA target. The real failure is
`chip-x`, which sets `padding: 0` so the button is exactly the size of the
glyph inside it — `<X size={12} />`.

That 12×12 one is the destructive control. `TeachingLoadTab.jsx:384` calls
`removeLoad(l.id)`, which deletes a saved teaching load from the database,
and it sits in a row of chips at half the minimum size. Its 13×13 neighbour
at line 339 only drops an item from the staging list, so a mis-tap there
costs nothing.

The fix needs no visual change — padding can extend the hit area past the
glyph:

```css
.chip-x { padding: 6px; margin: -6px; }
```

## 4. Text below 12px

`text-[9px]` twice, `text-[10px]` fourteen times, `text-[11px]` fifteen
times. 12px is the usual floor for anything a user must read; 9px is roughly
half the size of body text.

The 9px is the notification bell's unread count — small text **and** 3.76:1
contrast on red, so it fails twice. It is also the number that tells a
teacher there is work waiting.

---

## 5. Reduced motion is honoured in one place out of sixty-four

`prefers-reduced-motion` appears once, covering the flipping logo. There are
63 uses of `animate-spin` and `animate-pulse` — every loading spinner in the
system, plus the upload progress bar.

For a user with vestibular sensitivity, continuous spinning motion can cause
real nausea. They have already told their operating system this; the app is
not listening.

One global rule covers all of it:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. Icon-only buttons without labels

Nine icon-only buttons carry no `aria-label` — delete, edit and remove
controls in the admin tables. A screen reader announces them as "button" and
nothing more, so the user cannot know which row it belongs to or what it
does.

They already have `title` attributes, which help a mouse user and do nothing
for a screen reader.

---

## What to fix first

Ranked by what it costs against who it affects.

1. **The contrast swap.** Half a day, mostly search and replace, and it is
   the difference between a projector demo that reads and one that does not.
2. **The one focus-visible rule.** Ten minutes, fixes all 29 at once.
3. **The one reduced-motion rule.** Ten minutes, fixes all 63 at once.
4. **`chip-x` padding.** Five minutes, and it prevents accidental deletions
   of saved teaching loads. The only true AA touch-target failure.
5. **`aria-label` on nine buttons.** Half an hour.
6. **Raise 9px and 10px text to 12px.** An hour, some layout checking.

Items 2 and 3 are each a single CSS block for a whole category of problem.
Those are the best value in the list.

## What this audit did not cover

Stated so nobody assumes otherwise.

- **Screen reader testing.** Nothing here was run through NVDA or VoiceOver.
  Contrast and labels are measurable from code; whether a screen reader
  makes sense of a page is not.
- **Real devices.** Touch targets are measured in CSS pixels, not tested on
  a phone.
- **Colour blindness.** Status is conveyed by colour in several places —
  green/amber/red badges. Whether each carries a non-colour cue as well was
  not checked.
- **Visual design.** Spacing rhythm, hierarchy, whether it looks good. That
  is a judgement, not a measurement, and this document only contains things
  that can be measured.
