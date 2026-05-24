---
name: MSITest
description: Autonomous AI testing platform with Playwright execution and AI root cause analysis
colors:
  anchor-blue: "#1b61c9"
  anchor-blue-hover: "#254fad"
  anchor-blue-active: "#163f8f"
  anchor-blue-on: "#ffffff"
  ink: "#181d26"
  ink-secondary: "#333333"
  muted: "rgba(4, 14, 32, 0.69)"
  border: "#e0e2e6"
  border-soft: "#eef0f3"
  surface: "#ffffff"
  surface-warm: "#f8fafc"
  success: "#006400"
  success-text: "#006400"
  warn: "#eab308"
  warn-text: "#8a6500"
  danger: "#dc2626"
  danger-text: "#a10d3d"
  link: "#1264A3"
  browser-bg: "#1a1a2e"
  logo-blue: "#36C5F0"
  console-error: "#ff6b6b"
  console-warn: "#ffd93d"
  console-info: "#6bcbff"
typography:
  display:
    fontFamily: "Haas Groot Disp, Haas, -apple-system, system-ui, Segoe UI, Roboto, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Haas, -apple-system, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.35
  mono:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.anchor-blue}"
    textColor: "{colors.anchor-blue-on}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.anchor-blue-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  status-pill-success:
    backgroundColor: "rgba(0, 100, 0, 0.12)"
    textColor: "{colors.success-text}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-pill-danger:
    backgroundColor: "rgba(220, 38, 38, 0.10)"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-pill-warn:
    backgroundColor: "rgba(234, 179, 8, 0.12)"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  form-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
---

# Design System: MSITest

## 1. Overview

**Creative North Star: "The Flight Deck"**

MSITest is a flight deck for test operations. Every instrument reads clearly at a glance. Status lights tell the story before you read a word. The layout is dense where it needs to be (run tables, step timelines, console output) and breathes where density would hurt (section separators, card interiors, settings forms). Nothing is decorative. Everything is reachable.

The system draws from Airtable's visual language: a single saturated blue as the structural accent, generous border radii that soften without rounding into playfulness, and a strict division between the system font stack (body, labels, headings) and monospace (all technical content). The sidebar is the flight deck's instrument panel: always present, always blue, carrying navigation and status counts.

This system explicitly rejects AI-adjacent visual cliches. No sparkle icons, no gradient text, no purple or violet accents, no chatbot-style response cards. When AI analysis appears, it reads like a senior engineer's comment in a pull request: plain text, inline code snippets, a confidence percentage. The AI is infrastructure, not identity.

**Key Characteristics:**

- Restrained color: one saturated blue (Anchor Blue) carries navigation, primary actions, and active states. Everything else is neutral.
- Generous radii (12/16px) on all interactive elements and containers. Soft but not playful.
- Monospace for all technical content: test names, IDs, durations, file paths, code, status labels. System sans for everything else.
- Status is always visible via color-coded pills with dot indicators. Pass/fail/flaky/running reads without scanning.
- Flat surfaces by default. Elevation appears only on raised cards and settings sections, using a blue-tinted shadow.

## 2. Colors

The palette is a single-accent Restrained system. Anchor Blue owns navigation, primary actions, and active states. Semantic colors (success, warn, danger) carry status only. Neutrals are warm-tinted toward the blue axis.

### Primary

- **Anchor Blue** (#1b61c9): The structural accent. Sidebar background, primary buttons, active navigation items, focus rings, link color, AI insight borders. Used on roughly 15% of any authenticated surface (the sidebar alone). Presence is authority.
- **Anchor Blue Hover** (#254fad): Primary button hover. Darker, not lighter. Presses in, does not glow.

### Neutral

- **Ink** (#181d26): Primary text. Near-black with a cool blue undertone.
- **Ink Secondary** (#333333): Secondary body text, paragraph content.
- **Muted** (rgba(4, 14, 32, 0.69)): Metadata, timestamps, file paths, table headers, form hints. The workhorse color for secondary reading.
- **Border** (#e0e2e6): Standard borders on inputs, tables, cards, dividers.
- **Border Soft** (#eef0f3): Backgrounds for hover states, surface-warm areas, code editor backgrounds.
- **Surface** (#ffffff): Primary background.
- **Surface Warm** (#f8fafc): Alternate surface for warm-tone areas, hover backgrounds, code panels.

### Semantic

- **Success** (#006400): Passed tests, positive trends, approved status. Dark forest green. High contrast on white without shouting.
- **Warn** (#eab308): Flaky tests, running state, caution indicators. Amber.
- **Danger** (#dc2626): Failed tests, errors, destructive actions. Red.
- **Link** (#1264A3): Inline text links in content areas (not navigation). Slightly different from Anchor Blue to distinguish navigable links from UI chrome.

### Chrome

- **Logo Blue** (#36C5F0): Colored span in the "MSITest" sidebar logo. Appears nowhere else.
- **Browser BG** (#1a1a2e): Simulated browser viewport in screenshot placeholders. Dark navy.
- **Console Error** (#ff6b6b): Error-level console log text.
- **Console Warn** (#ffd93d): Warning-level console log text.
- **Console Info** (#6bcbff): Info-level console log text.

### Named Rules

**The One Accent Rule.** Anchor Blue is the only saturated color used for UI chrome. Semantic colors (success, warn, danger) appear exclusively in status indicators and trend arrows. No other hue family enters the interface.

**The Blue-Tint Shadow Rule.** All elevation shadows carry a blue component (rgba(45, 127, 249, 0.28)). Neutral-gray shadows look dead. The blue tint ties raised elements to the accent system.

## 3. Typography

**Display Font:** Haas Groot Disp (with Haas, system-ui fallback)
**Body Font:** Haas (with -apple-system, system-ui, Segoe UI, Roboto fallback)
**Mono Font:** SF Mono / JetBrains Mono (with ui-monospace, Menlo, Monaco, Consolas fallback)

**Character:** One family for display and body, no pairing friction. The system stack renders natively on every platform. Monospace is the technical voice: it handles everything the user needs to read as code, data, or machine output.

### Hierarchy

- **Display** (weight 700, 20-32px, line-height 1.2): Topbar titles, onboarding headings, settings section titles. Used sparingly, one per surface.
- **Body** (weight 400, 16px, line-height 1.35): Paragraph text, descriptions, form labels. Max line length 65-75ch for prose blocks.
- **Body Bold** (weight 600-700, 14-16px): Table cell names, card titles, section headers. Same family, weight shift.
- **Label** (weight 600, 11-12px, letter-spacing 0.04-0.08em, uppercase): Sidebar section labels, form field labels, filter labels, table headers. Always monospace. Always uppercase. The label voice is technical and terse.
- **Mono** (weight 600, 11-13px, letter-spacing 0.02em): Status pills, test names, file paths, IDs, durations, console output, code editor content. The default for any data that a developer would copy-paste.
- **Mono Metadata** (weight 400, 10-12px): Timestamps, secondary metadata, chart labels. Lighter weight for reduced prominence.

### Named Rules

**The Code Boundary Rule.** If the user might select it, copy it, or grep for it, it must be monospace. Test names, file paths, durations, status labels, console output, code snippets. Body text is for prose. Mono is for data.

## 4. Elevation

Flat by default. Most surfaces sit directly on the white background with a 1px border. Elevation is reserved for interactive containers that need visual separation: settings sections, onboarding cards, and raised UI elements.

The shadow vocabulary is minimal and blue-tinted.

### Shadow Vocabulary

- **Flat** (none): Default state for all surfaces. Tables, lists, stat cards, filter bars. A 1px border (#e0e2e6) provides sufficient separation.
- **Ring** (0 0 0 1px var(--border)): Inline bordered elements where no background color is needed.
- **Raised** (multi-layer with blue tint): Settings sections, onboarding cards, elements that float above the page. The shadow combines a tight dark base layer with a diffuse blue glow: `0 0 1px rgba(0,0,0,0.32), 0 0 2px rgba(0,0,0,0.08), 0 1px 3px rgba(45,127,249,0.28), inset 0 0 0 0.5px rgba(0,0,0,0.06)`.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat. Elevation is earned, not assumed. If a card or section does not need to float above its context, it should not have a shadow. Border color alone separates most elements.

## 5. Components

Every interactive component has default, hover, focus-visible, active, and disabled states. States are defined; they are not optional.

### Buttons

- **Shape:** Gently rounded corners (12px radius). Inline-flex with icon + text gap (6px).
- **Primary:** Anchor Blue background, white text, Anchor Blue border. Padding 9px 16px (small), 12px 24px (default). Font weight 600, size 14px.
- **Primary Hover:** Background darkens to Anchor Blue Hover (#254fad). No shadow addition.
- **Active:** translateY(1px) on press. Physical press, not a glow.
- **Secondary:** Transparent background, Ink text, Border-color border. Hover darkens border to Ink and tints background to Border Soft.
- **Ghost:** Transparent background and border, Muted text. Hover shows Border Soft background and Ink text.
- **Danger:** Transparent background, Danger text, Danger border. Hover tints background rgba(220,38,38,0.08).
- **Focus:** 3px ring using `color-mix(in oklab, var(--accent), transparent 70%)`. Blue, not black.

### Status Pills

- **Shape:** Pill radius (9999px). Inline-flex with 6px dot indicator and text. Font: mono, 11px, weight 600.
- **Success:** Background rgba(0,100,0,0.12), text #006400. Green dot.
- **Danger:** Background rgba(220,38,38,0.10), text #a10d3d. Red dot.
- **Warn:** Background rgba(234,179,8,0.12), text #8a6500. Amber dot.
- **Neutral:** Background Border Soft, text Muted, 1px Border. No dot.

### Sidebar Navigation

- **Shape:** 240px fixed width, full viewport height, sticky. Anchor Blue background. Sectioned with uppercase monospace labels (11px, 0.08em tracking, 50% white opacity).
- **Items:** Flex row with 16px SVG icon + text + optional count badge. Padding 8px 8px. Radius 12px (active states use a softer 6px in some variants). Text at 75% white opacity, full opacity on hover/active.
- **Hover:** rgba(255,255,255,0.1) background overlay.
- **Active:** rgba(27,97,201,0.25) background overlay (lighter blue on blue). Full white text.
- **Count badges:** Mono, 11px, rgba(255,255,255,0.15) background, 8px radius. Danger color for alert counts.

### Data Tables

- **Shape:** Full-width, border-collapse. Font size 14px body.
- **Headers:** Mono, 12px, uppercase, 0.06em tracking, Muted color. Bottom border: 2px solid Ink (heavy divider between header and data).
- **Rows:** 12px vertical padding, 12px horizontal. Bottom border: 1px solid Border Soft. Hover: Surface background tint.
- **Numeric columns:** Mono, tabular-nums, right-aligned. Duration, counts, percentages.
- **Clickable cells:** Cursor pointer, Anchor Blue on hover.

### Form Inputs

- **Shape:** 12px radius, 1px Border, Surface background. Padding 9px 12px. Font: body, 14-16px.
- **Focus:** Border shifts to Anchor Blue, 3px focus ring appears (color-mix with 70% transparent accent).
- **Error:** Border shifts to Danger.
- **Labels:** Mono, 11px, uppercase, 0.05em tracking, Muted color. Always above the input, never inside.
- **Hints:** Body, 12px, Muted. Below the input.

### Filter Bars

- **Shape:** Surface background, 1px Border Soft, 16px radius. Horizontal flex with gap. Wraps on narrow viewports.
- **Contents:** Mono label (uppercase, 12px) + select/input pair. Select has 12px radius, 1px Border, Surface background.

### AI Insight Cards

- **Shape:** Subtle diagonal gradient from rgba(74,20,75,0.04) to rgba(74,20,75,0.08). 1px border rgba(74,20,75,0.15). 16px radius. The only component with a non-neutral background tint, marking it as AI-generated content.
- **Header:** AI Badge (Anchor Blue background, white text, pill radius, 11px, weight 700) with inline SVG icon.
- **Body:** Body font, 14px, line-height 1.6. Code snippets in inline mono with purple-tinted background rgba(74,20,75,0.08). Strong tags in Anchor Blue.
- **Character:** Reads like a senior engineer's code review comment. No personality, no conversational tone. Technical, direct, actionable.

### Code Editor

- **Shape:** Surface Warm background, 1px Border, 12px radius. Mono font, 13px, line-height 1.6. White-space pre, tab-size 2.
- **Focus:** Border shifts to Anchor Blue.
- **Toolbar:** Mono filename (14px, weight 600) + action buttons. Tab bar with mono labels, 12px, active tab gets Anchor Blue background.

### Stat Cards

- **Shape:** Surface background, 1px Border Soft, 16px radius, 16px padding.
- **Label:** Mono, 12px, uppercase, 0.04em tracking, Muted. Top of card.
- **Value:** Mono, 32px, weight 700, -0.02em tracking, Ink. Center of card.
- **Trend:** Mono, 12px. Green for improvement, Red for regression. Inline with arrow.

### Failure Cards

- **Shape:** 1px Border on all sides, 4px Danger border-left accent. 16px radius. Surface background.
- **Header:** Bold title (16px, weight 700) + mono file path (12px, Muted) on the left. Status pill + relative timestamp on the right.
- **Body:** Two-column grid (insight left, screenshot right). On narrow viewports, stacks vertically.
- **Screenshot Placeholder:** Browser BG background, centered placeholder icon, mono caption "Screenshot captured at step N/M".

## 6. Do's and Don'ts

### Do:

- **Do** use monospace for any content a developer might copy, grep, or reference in a terminal: test names, file paths, IDs, durations, console output, code snippets, status labels.
- **Do** surface status immediately with color-coded pills and dot indicators. Pass/fail/flaky/running should read without scanning.
- **Do** use Anchor Blue for exactly three things: navigation chrome (sidebar), primary actions (buttons), and active/focus states. Its rarity is its authority.
- **Do** use the blue-tinted raised shadow for settings sections and onboarding cards. The blue component ties elevated surfaces to the accent system.
- **Do** keep section separators generous (24-32px). Dense data within sections, breath between sections.
- **Do** give every interactive element a focus-visible state: the 3px blue ring at 70% transparency.

### Don't:

- **Don't** use sparkle icons, magic wand imagery, gradient text, chatbot-style response cards, or any visual language that signals "AI tool." The AI is infrastructure, not identity. When AI analysis appears, it presents as structured technical content, not conversational output.
- **Don't** introduce a second saturated accent color. One accent (Anchor Blue) owns the interface. Semantic colors are for status only.
- **Don't** use pure black (#000) for text. Ink (#181d26) carries a blue undertone that binds to the accent system.
- **Don't** add shadows to table rows, stat cards, filter bars, or list items. These are flat surfaces separated by borders.
- **Don't** use display fonts in UI labels, buttons, data cells, or status indicators. The display family is for page titles only.
- **Don't** animate layout properties. Transitions stay on background-color, border-color, box-shadow, opacity, transform. Duration 150-200ms, ease cubic-bezier(0.2,0,0,1).
- **Don't** make the interface feel playful, whimsical, or personality-forward. This is a flight deck, not a social product. Precision and calm authority.
