-- New role for whoever created the team. Its own file: Postgres won't use a new enum value
-- in the same transaction that adds it, so run this before 20261028120100_team_owner.sql.
alter type public.member_role add value if not exists 'owner' before 'coach';
