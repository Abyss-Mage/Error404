---
name: Error404
description: A private-link bug board that looks like the error screen it is named after.
colors:
  signal-red: "#ff2a3a"
  red-text: "#ff5a66"
  red-deep: "#d1121f"
  red-deep-hover: "#b30f1b"
  fixed-green: "#3ddc84"
  band-black: "#000000"
  wall: "#0b0b0c"
  field-well: "#0f0f11"
  sheet: "#151517"
  raised: "#1d1d20"
  raised-hover: "#26262a"
  line: "#2a2a2f"
  quiet-edge: "#3a3a40"
  field-edge: "#6e6e76"
  control-edge: "#8a8a93"
  ink-2: "#a6a6ad"
  ink-body: "#d4d4d8"
  ink: "#f2f2f3"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.55
  meta:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  wordmark:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  code-tag:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  tag: "3px"
  thumb: "6px"
  input: "7px"
  control: "8px"
  sheet: "10px"
  pill: "99px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  field: "18px"
  lg: "20px"
  xl: "24px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.red-deep-hover}"
  button-quiet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-quiet-hover:
    backgroundColor: "{colors.raised-hover}"
  button-small:
    padding: "0 12px"
    height: "34px"
  input-text:
    backgroundColor: "{colors.field-well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "10px 12px"
  chip-environment:
    backgroundColor: "rgb(255 42 58 / .14)"
    textColor: "{colors.red-text}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "26px"
  error-code-tag:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.wall}"
    typography: "{typography.code-tag}"
    rounded: "{rounded.tag}"
    padding: "0 10px"
    height: "28px"
  error-code-tag-mini:
    padding: "0 8px"
    height: "24px"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
  header-band:
    backgroundColor: "{colors.band-black}"
    textColor: "{colors.ink}"
    padding: "16px 24px"
  workspace-rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  workspace-rail-item-current:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.white}"
---

# Design System: Error404

## Overview

**Creative North Star: "The Error Screen"**

Error404 looks like the error screen it is named after. The ground is near-black, content sits on charcoal sheets, ink is white, and signal red is the only brand colour. Every reported problem is a red error-code block carrying its number; fixing it glitches the block out of existence and leaves a dashed outline where it was. Green appears only as the fixed state.

The system is dense and calm in its working parts (forms, lists, rails are plain, legible, standard controls) and loud only in two places: the red error-code tag and the glitch. The glitch is the world's single motion idea: horizontal slice offsets with RGB-split edges, stepped rather than eased, short enough to read as a flicker. It appears on the wordmark (a split second every 5 s), when a report lands, and when one is fixed.

Type is the platform system stack throughout (a project constraint: single-file, system fonts), with a monospace face reserved for error codes. Everything is dark-only (`color-scheme: dark`).

**Key Characteristics:**
- Near-black wall, charcoal sheets, one red, green only for fixed.
- The error-code tag is the signature object: red block, black monospace number, RGB-split edges.
- Glitch motion: stepped slice-and-offset, 360-380 ms on objects, about 300 ms per 5 s cycle on the wordmark; all of it off under reduced motion.
- Flat surfaces separated by 1px hairlines plus one soft ambient shadow on sheets.
- Standard controls, gently rounded (7-10px), no decorative ornament.

## Colors

A black-and-signal-red error palette: neutrals step up from pure black through charcoal, red carries every brand and alert role, green is reserved for done.

### Primary
- **Signal Red** (signal-red): the brand. Logo block, the "404" in the wordmark, error-code tags, the 2px header hairline, the 3px top edge of the sign-in sheet, focused-field borders, drop-zone hover border, text caret, and the selection tint at 42%. Used as a fill or a stroke, never as body-size text on dark (use Red Text).
- **Red Text** (red-text): the text-safe red. Links, error messages, open-state labels, environment chip text, and the 2px focus ring. 6.0:1 on sheet, 6.5:1 on wall.
- **Deep Red** (red-deep): primary button fill; white label on it measures 5.5:1. Hover deepens to Deep Red Hover (red-deep-hover); white on it measures 7.0:1.

### Secondary
- **Fixed Green** (fixed-green): only the fixed state. Checked "Fixed" checkbox fill, "Fixed" status label, the success notice after publishing. 10.2:1 on sheet.

### Neutral
- **Band Black** (band-black): the header band only, so the band reads as the darkest strip above the wall. Also the browser `theme-color`.
- **Wall** (wall): page ground and scrollbar track; also the ink colour on the red tag (5.3:1).
- **Field Well** (field-well): inside text inputs, textareas and the unchecked checkbox, a step darker than the sheet so fields read as recessed.
- **Sheet** (sheet): cards: report form, problem list, new-workspace form, share box, sign-in, empty states, current rail item.
- **Raised** (raised) / **Raised Hover** (raised-hover): quiet and on-band button fills.
- **Line** (line): 1px hairlines: sheet borders, row dividers, header divider, thumbnail borders.
- **Quiet Edge** (quiet-edge): quiet-button border and scrollbar thumb.
- **Field Edge** (field-edge): input borders (3.8:1 against the well), drop-zone dashes, dashed outline of a fixed tag; quiet-button hover border.
- **Control Edge** (control-edge): checkbox border (5.3:1 on sheet) and placeholder text (5.6:1 on the well).
- **Ink 2** (ink-2): secondary text: hints, meta, counts, rail headings, done titles. 7.5:1 on sheet.
- **Body Ink** (ink-body): problem details paragraphs (12.3:1 on sheet), softer than headings.
- **Ink** (ink): primary text, 16.3:1 on sheet, 17.6:1 on wall.

### Named Rules
**The One Red Rule.** Red is the only brand colour. Every accent, alert and primary action is a red from the four red tokens; no second hue is introduced for emphasis.

**The Green Means Fixed Rule.** Fixed Green appears only for the resolved state and the publish-success notice. It is never decoration or a generic "go" colour.

**The Text-Safe Red Rule.** Red at text size uses Red Text; Signal Red is for fills, strokes, and large marks.

## Typography

**Display Font:** Segoe UI Variable Text (with Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial)
**Body Font:** the same system stack
**Label/Mono Font:** ui-monospace (with Cascadia Mono, Consolas), error-code tags only

**Character:** One plain system sans carries everything, heavy (750-800) and slightly tightened at the top, regular and roomy (1.55) in text. Monospace is the error-code voice and nothing else.

### Hierarchy
- **Display** (800, 34px, 1.2, -0.02em): the selected workspace name on the admin page. The large sign-in wordmark (800, 28px) sits at the same weight.
- **Headline** (750, 28px, 1.2; 22px at 880px and below): the workspace name in the tester header band.
- **Title** (700, 18px): sheet and list headings ("Report a problem", "Problems"). Smaller title (650, 16px): problem titles in rows; new-workspace heading and empty-state lead (16px, bold).
- **Body** (400, 15px, 1.55): all running text; problem details capped at 68ch.
- **Label** (600, 14px): field labels, checkbox label, environment link; small buttons drop to 14px at weight 650.
- **Meta** (400-700, 13px): hints, reporter and time line, environment under rail names, chips (700), status labels (700), rail heading (700, Ink 2).
- **Wordmark** (800, 19px, -0.02em, tabular numerals): "Error" in Ink, "404" in Signal Red.
- **Code tag** (800, 14px mono, line-height 1, +0.02em): "#12" on the error-code block; 13px on the mini tag.

Headings use `text-wrap: balance`; long names break with `overflow-wrap: anywhere`. Counts use tabular numerals.

### Named Rules
**The Mono Is Evidence Rule.** Monospace is used only for issue numbers and counts inside error-code tags, so a mono number always means "an error on the list".

## Layout

Centered column, max 1160px, 24px side padding, used by both the header band and the main content. Main content pads 28px top and 72px bottom with a 28px grid gap.

- **Tester view:** two columns, report form sheet (300-400px) left, problem list right. The form is sticky 20px from the top.
- **Admin view:** a 270px left column holding the workspace rail above the new-workspace form; the selected workspace fills the right column.
- **Sign-in:** a single sheet, max 400px, centered in the full dynamic viewport height.

**At 880px and below:** both views collapse to one column; admin order becomes rail, workspace, then new-workspace form. The report form stops sticking, the band headline drops to 22px, and the band's vertical divider is hidden.

**At 560px and below:** page padding tightens to 20px / 14px / 56px; form padding to 18px. Problem rows become two rows: tag and status share the first line, title and details take the full width below (row padding 16px). The share box wraps and its Copy button goes full width.

Spacing rhythm is 4px-based but uneven in practice: 8, 12, 16 and 20px for internal gaps; 18px between fields; 22px form padding; 28px between major regions.

## Elevation & Depth

Mostly flat tonal layering: band (pure black) sits above wall (near-black), sheets are one step lighter with a 1px hairline, fields are recessed one step darker than the sheet. A single soft ambient shadow lifts sheets off the wall; nothing else casts a shadow.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 14px 34px -18px rgb(0 0 0 / .9)`): every sheet and the problem list. Ambient, not structural; the hairline does the edge work.
- **Focus halo** (`box-shadow: 0 0 0 3px rgb(255 42 58 / .25)`): text fields on keyboard focus, with the border turning Signal Red.
- **RGB split** (`box-shadow: -2px 0 0 rgb(255 255 255 / .55), 2px 0 0 #7a0710`): only on the error-code tag's red block. This is chromatic aberration, the glitch world's native device, not a drop shadow.

### Named Rules
**The One Lift Rule.** Sheets get the one ambient shadow. Buttons, chips, rows and rail items stay flat; state is shown by fill and border, never by elevation.

## Shapes

Gently rounded rectangles throughout, radius growing with size: 3px on error-code tags, 6px on thumbnails and the checkbox, 7px on text fields, 8px on buttons, drop zone and rail items, 10px on sheets. Chips are full pills (99px). Borders are 1px hairlines; dashed 1.5px strokes mark "something can go here" (drop zone) or "something was here" (fixed tag, zero-count tag). The sign-in sheet carries a 3px Signal Red top edge, echoing the band's 2px red hairline.

The logo mark is a 36px red rounded square (7px radius in a 40px box) with a black ring split horizontally and offset 4px (the glitched "0"), plus two black 10x3 shards cut into its left and right edges.

## Components

### Header Band
Pure-black strip with a 2px Signal Red bottom hairline. Holds the logo (30px mark, 10px gap, 19px wordmark), then on the tester page a 1px Line divider and the workspace headline; right-aligned end group holds the environment chip and an on-band small button, or "Signed in as" (14px Ink 2, name in Ink) and Sign out. Wraps freely.

### Logo and Wordmark
Mark plus "Error404" wordmark with "404" in Signal Red. Large variant (sign-in): 44px mark, 28px wordmark. The wordmark carries two duplicate text layers (red and white) that are invisible except during the glitch (see Motion).

### Buttons
- **Shape:** gently rounded (8px), 1px border, min-height 42px, padding 0 16px, 8px icon gap, weight 650.
- **Primary:** Deep Red fill, white label. Hover (pointer devices only) deepens to Deep Red Hover, keeping the white label at 7.0:1.
- **Quiet / On-band:** Raised fill, Ink label, Quiet Edge border; hover goes to Raised Hover with a Field Edge border. Used for Show/Hide, Copy link, Remove, Open site, Sign out.
- **Small:** 34px tall, 0 12px padding, 14px text. **Wide:** full width (form submits).
- **Press:** scales to .97. **Disabled:** 55% opacity, no press. Transitions 160ms on transform, background and border, ease-out.

### Chips
- **Environment chip:** 26px pill, 0 10px padding, 13px weight 700, Red Text on Signal Red at 14% opacity (6.3:1 on the band). One variant only.

### Cards / Containers (Sheets)
- **Corner Style:** 10px.
- **Background:** Sheet, 1px Line border, the Sheet lift shadow.
- **Internal Padding:** 22px (report form), 20px (new workspace), 14px (share box), 32px 28px 28px (sign-in).
- **Empty state:** a sheet with 36px 24px padding, centered Ink 2 text under a 16px Ink lead line.

### Inputs / Fields
- **Style:** Field Well fill, 1px Field Edge border, 7px radius, 10px 12px padding, inherits body type. Textareas start at 104px and resize vertically. Label (14px 600) and hint (13px Ink 2) stack above with a 6px gap; 18px between fields.
- **Focus:** border turns Signal Red plus the 3px red focus halo; no outline.
- **Error:** form-level message in Red Text, 14px 600, announced as an alert; hidden when empty. Success notice in Fixed Green with a check icon.
- **Read-only link field:** Ink 2 text at 14px, selects all on focus.

### Drop Zone
Screenshot target: 1.5px dashed Field Edge border, 8px radius, a recessed near-black fill, centered image icon, bold Ink line and 14px Ink 2 instruction. Hover or drag-over turns the border Signal Red and the fill a dark red-black. Keyboard focus gets the standard red focus ring. A 96x64 preview thumbnail (6px radius, Line border) with a small quiet Remove button appears after.

### Problem List (signature)
One sheet holding rows separated by 1px Line hairlines. Row grid: 64px tag column, text, then status at the end; 16px gap, 18px 20px padding. Title 16px 650; details in Body Ink, capped at 68ch, pre-wrapped; optional screenshot up to 360x200 with 6px radius; meta line 13px Ink 2 ("Reporter · time · fixed by"). Open items list first, newest first.
- **Done row:** title in Ink 2 with a 1.5px strike-through, details in Ink 2, the tag empties to a dashed outline.
- **Status (tester side):** 13px 700 with icon, Red Text "Open" or Fixed Green "Fixed".

### Error-Code Tag (signature)
Red block with the issue number in black monospace: min 56px wide, 28px tall, 3px radius, RGB-split edges (white left, dark red right).
- **Done:** fill removed, number in Ink 2, 1.5px dashed Field Edge outline.
- **Mini (rail count):** min 34px, 24px tall, 13px.
- **Zero (mini with no open items):** same dashed, unfilled treatment as done.

### "Fixed" Checkbox (Peel)
Native checkbox restyled: 22px, 1.5px Control Edge border, 6px radius, Field Well fill. Checked: Fixed Green fill and border with a black check. Presses to .9 scale. Labelled "Fixed" (14px 600) inside a 4px-padded hit area.

### Navigation (Workspace Rail)
A 13px 700 Ink 2 heading, then full-width rail buttons (10px 12px padding, 8px radius, 2px gap): name in Ink 600, environment below in 13px Ink 2, mini tag at the end. Hover (pointer only) darkens slightly. Current item: Sheet fill, Line border, name in white.

### Sign-in Sheet
Centered 400px sheet with a 3px Signal Red top edge; large logo as the page heading, Ink 2 lede, key field with a quiet Show/Hide toggle in a row, wide primary Sign in button, 13px Ink 2 footnote.

### Motion
- **Wordmark glitch:** two text layers (Signal Red and white at 85%) flash in on stepped keyframes for roughly the last 6-10% of a 5s loop, each showing a horizontal slice offset 2-4px. Hovering the logo speeds the loop to .6s.
- **Glitch in:** when a report lands or a fixed item is reopened, the tag's red block slices in over 360ms, `steps(4, end)`.
- **Glitch out:** when marked fixed, the red block slices and offsets away over 380ms, `steps(4, end)`, ending invisible.
- **Landed flash:** a freshly published row fades from a 12% red tint over 1600ms.
- **State transitions:** 160ms, `cubic-bezier(.23, 1, .32, 1)`; buttons press to .97, checkbox to .9.
- **Reduced motion:** every glitch, the landed flash, and button/checkbox/drop-zone transitions are switched off.

### Browser Surfaces
Dark color scheme; selection is Signal Red at 42% with white text; caret is Signal Red; scrollbar thumb Quiet Edge on a Wall track; global focus ring is 2px solid Red Text at 2px offset (fields swap it for the red border plus halo); link underline offset 3px.

## Do's and Don'ts

### Do:
- **Do** keep the ground near-black and every brand accent red: the four red tokens cover fill, text, action and hover.
- **Do** use Red Text, not Signal Red, for any red text at body or label size.
- **Do** show each problem as a red error-code tag with a monospace number, and turn it into a dashed outline when it is fixed.
- **Do** use the glitch (stepped slice-and-offset, 360-380ms, `steps(4, end)`) only for an object arriving, leaving, or the wordmark's idle flicker, and switch it off under `prefers-reduced-motion`.
- **Do** keep sheets at 10px radius with a 1px Line border and the single Sheet lift shadow.
- **Do** gate hover styles behind `(hover: hover)` and give every control the 2px Red Text focus ring.

### Don't:
- **Don't** use green for anything but the fixed state and the publish-success notice.
- **Don't** introduce coloured status pills or a grey ticket table; open versus fixed is told by the red tag versus the dashed outline.
- **Don't** put shadows on buttons, chips, rows or rail items; only sheets lift.
- **Don't** use the monospace face outside error-code tags.
- **Don't** let a glitch run continuously or longer than about 400ms on content; the wordmark flicker is the only loop.
