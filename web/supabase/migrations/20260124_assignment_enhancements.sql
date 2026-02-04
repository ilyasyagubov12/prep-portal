-- Extra metadata for assignments
alter table assignments
  add column if not exists due_at timestamptz,
  add column if not exists max_score numeric,
  add column if not exists max_submissions int check (max_submissions > 0);

-- Files uploaded by teachers for an assignment
create table if not exists assignment_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now()
);

alter table assignment_files enable row level security;

-- Teachers/admins can manage files; students can read if assignment published
drop policy if exists assignment_files_staff_all on assignment_files;
create policy assignment_files_staff_all on assignment_files
  for all using (
    exists (
      select 1
      from assignments a
      left join course_teachers ct on ct.course_id = a.course_id and ct.teacher_id = auth.uid()
      left join profiles p on p.user_id = auth.uid()
      where a.id = assignment_files.assignment_id
        and (
          p.is_admin = true
          or lower(coalesce(p.role,'')) = 'admin'
          or lower(coalesce(p.role,'')) = 'teacher' and ct.id is not null
        )
    )
  );

drop policy if exists assignment_files_students_read on assignment_files;
create policy assignment_files_students_read on assignment_files
  for select using (
    exists (
      select 1
      from assignments a
      where a.id = assignment_files.assignment_id
        and a.status = 'published'
        and is_enrolled(auth.uid(), a.course_id)
    )
  );
