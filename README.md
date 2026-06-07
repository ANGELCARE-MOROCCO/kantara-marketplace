# Kantara

Kantara is a managed Morocco stays marketplace.

Core positioning:

- Morocco stays, managed with confidence.
- The trusted bridge to Morocco.
- Verified homes. Clear rules. Local intelligence.
- International confidence, Moroccan precision.

This codebase is a production-oriented Next.js 14 marketplace with internal auth,
admin operations, partner onboarding, listing management, reservation snapshots,
database-backed homepage configuration, configurable branding, and global
currency and localization controls.

## Globalization

The marketplace supports:

- Display currency selection with database-backed settings and server-side
  exchange-rate sync.
- Immutable reservation price snapshots.
- Cached UI translations with English fallback.
- A global language selector with Arabic RTL support.
- Admin-controlled branding audit, currency controls, language settings, and
  translation sync at `/admin/globalization`.
