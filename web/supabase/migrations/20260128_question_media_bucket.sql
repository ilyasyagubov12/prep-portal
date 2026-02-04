-- Create bucket for question images (public)
insert into storage.buckets (id, name, public)
values ('question-media', 'question-media', true)
on conflict (id) do nothing;

-- RLS policies on storage.objects for this bucket
-- Drop first to avoid duplicate errors (Postgres <15 lacks IF NOT EXISTS)
do $$ begin
  drop policy if exists question_media_read on storage.objects;
  drop policy if exists question_media_write on storage.objects;
end $$;

-- allow anyone to read public objects
create policy question_media_read
  on storage.objects
  for select
  using (bucket_id = 'question-media');

-- allow staff to upload/delete their objects
create policy question_media_write
  on storage.objects
  for all
  using (
    bucket_id = 'question-media'
    and exists (
      select 1 from profiles p
      where p.user_id = auth.uid()
        and (p.is_admin = true or lower(coalesce(p.role,'')) in ('admin','teacher'))
    )
  );
