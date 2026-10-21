# Peta dokumentasi SDJ Assistant

Implementasi aktif berada di `apps/` dan `packages/`, dengan migration pada `supabase/migrations/`. Mulai dari [README proyek](../README.md) dan [status implementasi](IMPLEMENTATION_STATUS.md).

Dokumen desain v1 (`PRD.md`, `ARCHITECTURE.md`, `SCHEMA.md`) dipertahankan sebagai rujukan. Keputusan pengguna memperluas lingkup menjadi 15 aktivitas, multi-item, tiga provider AI, dan Supabase utama untuk runtime/integration tests. [ADR 0001](adr/0001-primary-environment-full-mvp.md) menjelaskan ketentuan yang menggantikan v1. Kontrak runtime yang berlaku ada pada `packages/domain`, `packages/contracts`, dan migration SQL.

Panduan:

- [Pengingat dan profil Google](runbooks/reminders.md).

- [Google OAuth: tombol demi tombol](runbooks/google-oauth.md).
- [Menjalankan dan memulihkan aplikasi](runbooks/operations.md).
- [Bukti OpenClaw dan gate G0](spikes/openclaw-channel.md).
- [Proses kontribusi](AGENTS.md).
