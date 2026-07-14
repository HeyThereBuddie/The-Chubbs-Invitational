-- Permanently remove the 5 test tournaments sitting in "Deleted Years".
-- Scoped to soft-deleted rows only (deleted_at IS NOT NULL) so a live/active
-- tournament that happens to share a name can never be hit. Results/roster/etc.
-- cascade via their FK ON DELETE CASCADE.
delete from public.tournaments
 where deleted_at is not null
   and name in (
     'The Chubbs test 3',
     'The Chubbs Memorial 2026',
     'The Chubbs Memorial',
     'The Chubbs Memorial - 2026 - Test',
     'The Chubbs Memorial - 2026 - test 2'
   );
