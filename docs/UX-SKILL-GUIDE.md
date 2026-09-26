# Using the UI/UX skill on EduScribe

A working reference for which question to ask about which part of the portal.

## The part most people get wrong

You do not run anything. The skill activates on what you *say*.

Ask "ayusin mo yung grades table ni teacher, ang sikip tingnan" and the skill
loads by itself, because the request is about UI. There is no command to
memorise and no flag to get right.

The command line below is only for when you want to look something up
yourself, without going through Claude.

## Which of the seven skills does what

Installed as the `ui-ux-pro-max` plugin. Only the first two matter for this
project; the rest need image-generation API keys and make logos, decks and
banners.

| Skill | Use it for | Relevant here |
| --- | --- | --- |
| `ui-ux-pro-max` | 119 UX rules, contrast, accessibility, layout, stack guidance | **Yes — the main one** |
| `ui-styling` | Tailwind and shadcn implementation patterns | **Yes — this project is Tailwind** |
| `design-system` | Token architecture (primitive → semantic → component) | Maybe, if you formalise the theme |
| `design` | Logo generation, corporate identity | No — needs Gemini/MuAPI keys |
| `slides` | HTML presentations with Chart.js | Only for your defence deck |
| `banner-design` | Social/ad banners | No |
| `brand` | Brand voice and messaging | No |

## Map: part of the portal → what to say

Say these to Claude in plain language. The second column is what the skill
will actually be asked under the hood, if you ever want to run it yourself.

### Public pages

| Part | Say this | Query behind it |
| --- | --- | --- |
| Home carousel | "is the carousel accessible?" | `"carousel autoplay pause control"` |
| News cards | "the news grid feels cramped" | `"card grid spacing density"` |
| Calendar month view | "the calendar is hard to scan" | `"calendar grid event density"` |
| Login chooser | "which button should be primary?" | `"primary secondary button hierarchy"` |

### Student dashboard

| Part | Say this | Query behind it |
| --- | --- | --- |
| `OverviewTab` stat cards | "the stat cards don't read well" | `"metric card label value emphasis"` |
| `TasksTab` list | "how should overdue tasks look?" | `"status indicator not colour alone"` |
| `AttendanceTab` | "the attendance table is dense" | `"data table readability row height"` |
| Empty states | "what if a student has no tasks?" | `"empty state first time user guidance"` |

### Teacher dashboard

| Part | Say this | Query behind it |
| --- | --- | --- |
| `GradesTab` | "grade entry is painful" | `"inline edit table keyboard navigation"` |
| `WorksheetsTab` upload | "the upload feedback is unclear" | `"file upload progress error feedback"` |
| `LessonPlansTab` AI wait | "the AI generation wait feels broken" | `"long operation progress feedback"` |
| `StudentsTab` roster | "two rosters, one screen" | `"grouped list section heading"` |

### Admin dashboard

| Part | Say this | Query behind it |
| --- | --- | --- |
| `UsersTab` modal | "the user form errors are confusing" | `"form validation error message placement"` |
| `TeachingLoadTab` | "the staging list is confusing" | `"multi select draft confirm pattern"` |
| `SchedulesTab` | "too many steps to set a schedule" | `"progressive disclosure step flow"` |
| Delete actions | "deleting feels too easy" | `"destructive action confirmation"` |

### Registrar dashboard

| Part | Say this | Query behind it |
| --- | --- | --- |
| `PreEnrollmentTab` queue | "the approval queue is slow to work through" | `"bulk actions multi select queue"` |
| `DocumentsTab` | "document status is unclear" | `"status badge state communication"` |
| `AnalyticsTab` charts | "which chart for enrolment over time?" | `--domain chart "time series trend"` |

## Aiming a query

This is the real skill, and the tool's own rules say so: **one idea, two to
five words, retry once if the answer is off-topic.**

A query that failed, live:

```
"dashboard metric card scannable hierarchy"   → Breadcrumbs, Heading Hierarchy
```

Three ideas at once, so it matched none of them. Narrowed to one idea each,
the same database answered properly:

```
"empty state first time user guidance"        → Empty States
"loading skeleton placeholder empty state"    → Loading Indicators
```

If the second try is still wrong, the data does not cover it. Say so rather
than using a general answer and calling it specific.

## Running it yourself

PowerShell, from anywhere:

```powershell
python "$env:USERPROFILE\.claude\plugins\cache\ui-ux-pro-max-skill\ui-ux-pro-max\2.13.0\.claude\skills\ui-ux-pro-max\scripts\search.py" "<query>" --domain ux
```

The version number sits in that path, so it changes when the plugin updates.
If it stops working, look at what is actually under
`.claude\plugins\cache\ui-ux-pro-max-skill\ui-ux-pro-max\`.

Needs a terminal opened **after** Python was installed, or `python` is not yet
on PATH.

**Domains:** `ux` (most of the time), `color`, `typography`, `style`, `chart`,
`icons`, `landing`, `product`, `gsap`, `react`, `web`, `google-fonts`

**Stacks:** use `--stack react` or `--stack html-tailwind` for this project —
`--stack shadcn` only if you adopt shadcn, which you have not.

Useful flags: `-n 5` for more results, `--full` to stop truncating, `--json`
to pipe it somewhere.

### The one that needs care

```bash
... "school portal student teacher" --design-system -p "EduScribe"
```

This invents a **whole new visual direction** — palette, fonts, the lot. Your
portal already has one (navy `#003b7a`, gold `#FEB300`, cyan `#00D4FF`) and
the audit found it consistent. Running this and applying the output would
throw that away and give you a second, conflicting theme. Read it as a
reference if you like; do not apply it wholesale.

Never add `--persist` unless you mean to write design-system files into the
repo.

## What it is good at, and what it is not

Good at: naming a rule, giving a threshold, catching a category you forgot.
It corrected this project once already — the touch-target minimum for web is
24×24 CSS px, not the 44×44 everyone quotes, which is iOS guidance.

Not good at: knowing *your* screen. It has never seen `GradesTab`. It returns
rules, and the judgement about whether a rule applies here is still yours and
Claude's. Treat a result as a recommendation to check, not an instruction to
follow.

Related: [UX-AUDIT.md](UX-AUDIT.md) — the measured findings for this portal.
