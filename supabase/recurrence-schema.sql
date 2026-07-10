-- Couple's Hub — richer recurrence (weekly multi-weekday + end date)
-- Run once in Supabase → SQL Editor. Safe to re-run.
--   recur_days  : comma weekday numbers, 0=Sun … 6=Sat (e.g. "2,4" = Tue & Thu). Only used when recur='weekly'.
--   recur_until : ISO date after which the series stops.

alter table tasks  add column if not exists recur_days  text;
alter table tasks  add column if not exists recur_until date;
alter table events add column if not exists recur_days  text;
alter table events add column if not exists recur_until date;

notify pgrst, 'reload schema';
