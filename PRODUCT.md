# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML/CSS/JS in a single `index.html`, no framework or build step. One Node serverless function (`api/index.js`) on Vercel, data in Upstash Redis. Chosen with the user on 2026-11-10 (Vercel hosting confirmed by the user).

## Users

- **Testers:** mostly clients and non-technical people. They open a private workspace link, usually once or a few times, and report what is broken. They have no account and should never feel they need one.
- **Admins:** the owner plus a few teammates. They create workspaces, share links, triage reports and check issues off as fixed.

## Product Purpose

Error404 collects bug reports from people testing a site or app before launch. Each workspace is tied to one environment (for example Staging and its URL), so every report arrives already labelled with where it happened. Success: a client can report a problem in under a minute without help, and the team can see what is open and close it.

## Positioning

No tester accounts: a private link is the whole onboarding. Reports are scoped to one environment per link.

## Operating Context

- Testers open the link from an email or chat, often with the environment open in another tab. Screenshots come from the clipboard (snip tools) or a file.
- Admins work at a desktop, switching between workspaces and checking items off.

## Capabilities and Constraints

- Workspace: name, environment name, environment URL, private tester link.
- Issue: title (required), details, reporter name, optional screenshot (PNG/JPEG/WebP, at most 3 MB after in-browser JPEG re-encoding), open or fixed.
- Testers can see all issues in their workspace and their status; only admins can mark fixed.
- Vercel request body limit 4.5 MB. No email notifications, no workspace deletion, no comments yet.
- Admin access is by secret key; each teammate gets their own key.

## Brand Commitments

Name: **Error404**. No logo or other assets exist yet.

## Evidence on Hand

None. Do not invent customers, testimonials or usage numbers.

## Product Principles

1. A tester should never wonder what to do next: one obvious form, plain words.
2. Every report carries its environment; the context is never lost.
3. Admin triage is about speed: open items first, one click to close.
4. Private links and admin keys are the security model; never leak them (referrers, logs, URLs).

## Accessibility & Inclusion

Testers include non-technical people of any age; WCAG 2.2 AA, full keyboard use, and reduced-motion support are required.
