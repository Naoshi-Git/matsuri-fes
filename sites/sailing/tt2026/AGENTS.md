# Coding guidance — Sailing KOBE 2026 PWA
- This directory is an independent public GitHub Pages PWA. Do not modify or publish content from private operational/career repositories.
- Authoritative data: data/schedule.json from the two linked official PDFs; 189 scheduled stage slots, 62 performance teams, 3 venues. Keep functions/schedule.json identical. Do not invent missing team names, actual progression or finale results.
- Date: 2026-07-04 (ended). Preserve archive mode after the event; do not send old-year notifications.
- Distinguish scheduled estimate from operator-confirmed status. Live changes must be authenticated operational inputs, never inferred from elapsed wall-clock time.
- Material Design 2, mobile-first, accessibility, Japanese labels. No AI-styled gradients or fabricated graphics.
- PWA SW must remain scoped to sites/sailing/tt2026. Do not intercept other Matsuri FES routes.
- No VAPID private key, Firebase service-account credential, personal push subscription or unpublished announcement in Git. config.js contains public client keys only.
- Tests: node --test sites/sailing/tt2026/tests/*.test.cjs. For a new edition update both JSON files and adjust tests and Cloud Function date guard.
