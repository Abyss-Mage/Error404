---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

Scope: index.html, all three views (admin sign-in, admin dashboard, tester workspace page). Mode: Operate.
Audience: testers are clients / non-technical people on a private link; admins are the owner plus a few teammates at desktops.
Task: tester reports a problem in under a minute, optional screenshot; admin sees open items first and checks them off.
Constraints: single-file vanilla HTML/CSS/JS, system fonts, WCAG 2.2 AA, reduced motion respected, standard controls only.
User-pinned (2026-11-10): red and black error-screen palette with glitch effects, and an Error404 logo. This replaced the earlier painter's-tape blue world.

## Direction contract

THESIS: Error404 looks like the error screen it is named after. Every reported problem is a red error-code block on a black screen; fixing it glitches the block out of existence. Refuses the default grey ticket table with coloured status pills.

OWN-WORLD: near-black ground (#0b0b0c) with charcoal sheets, white ink, signal red (#ff2a3a) as the only brand colour: header hairline, logo, number tags, primary buttons, errors. Green only as the fixed state. Logo: red block whose 0 is split by a horizontal glitch, plus the Error404 wordmark with 404 in red; wordmark glitches (RGB-split slices) for a split second every few seconds.

STORY: a client opens their link, sees which site they are testing and a button to open it, writes what went wrong, adds a screenshot, and sees their problem appear as a numbered red block. Admins see workspaces with open counts, read the list open-first, and tick problems fixed.

FIRST VIEWPORT: tester: black header with logo, workspace name large, environment chip and Open site button; below, the report form sheet left (Publish at its foot) and the problem list right. Admin: workspace rail and New workspace form left, workspace header, tester link and problem list right. Signature move: a red tag glitches in when published and glitches out when fixed.

FORM: snag list (position 1, Impeccable's pick), re-skinned to the user-pinned red/black glitch palette, seed:85dd7c1e6cb315ac

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
