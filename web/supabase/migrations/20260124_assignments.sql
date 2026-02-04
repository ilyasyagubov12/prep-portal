-- Assignments core tables
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  body jsonb,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extend course_nodes to host assignment entries (location only)
do $$
begin
  alter table course_nodes add column assignment_id uuid;
exception when duplicate_column then null;
end$$;

alter table course_nodes
  add constraint course_nodes_assignment_fk foreign key (assignment_id) references assignments(id) on delete set null;

-- relax kind enum to include assignment
do $$
begin
  alter table course_nodes drop constraint if exists course_nodes_kind_check;
  alter table course_nodes drop constraint if exists course_nodes_kind_check1;
  alter table course_nodes drop constraint if exists course_nodes_kind_check2;
  alter table course_nodes add constraint course_nodes_kind_check check (kind in ('folder','file','assignment'));
exception when others then null;
end$$;

-- Submissions + Grades
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references profiles(user_id),
  file_path text not null,
  file_name text,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  grader_id uuid not null references profiles(user_id),
  score numeric,
  feedback text,
  graded_at timestamptz not null default now(),
  unique(submission_id)
);

-- RLS
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table grades enable row level security;

-- Helper: check enrollment
create or replace function public.is_enrolled(uid uuid, course uuid) returns boolean as $$
  select exists (
    select 1 from enrollments e where e.user_id = uid and e.course_id = course
  );
$$ language sql stable;

-- Assignments policies
create policy if not exists assignments_select_students on assignments
  for select using (
    status = 'published' and is_enrolled(auth.uid(), course_id)
  );

create policy if not exists assignments_select_staff on assignments
  for select using (
    exists (
      select 1 from profiles p
      left join course_teachers ct on ct.teacher_id = p.user_id and ct.course_id = assignments.course_id
      where p.user_id = auth.uid()
        and (p.is_admin = true or lower(coalesce(p.role,'')) = 'admin' or lower(coalesce(p.role,'')) = 'teacher')
        and (p.is_admin = true or ct.id is not null or lower(coalesce(p.role,'')) = 'admin')
    )
  );

create policy if not exists assignments_write_staff on assignments
  for all using (
    exists (
      select 1 from profiles p
      left join course_teachers ct on ct.teacher_id = p.user_id and ct.course_id = assignments.course_id
      where p.user_id = auth.uid()
        and (p.is_admin = true or lower(coalesce(p.role,'')) = 'admin' or lower(coalesce(p.role,'')) = 'teacher')
        and (p.is_admin = true or ct.id is not null or lower(coalesce(p.role,'')) = 'admin')
    )
  );

-- Submissions policies
create policy if not exists submissions_students_rw on submissions
  for all using (
    auth.uid() = student_id
  );

create policy if not exists submissions_staff_read on submissions
  for select using (
    exists (
      select 1
      from assignments a
      join course_teachers ct on ct.course_id = a.course_id and ct.teacher_id = auth.uid()
      where a.id = submissions.assignment_id
    )
    or exists (
      select 1 from profiles p where p.user_id = auth.uid() and (p.is_admin = true or lower(coalesce(p.role,'')) = 'admin')
    )
  );

-- Grades policies
create policy if not exists grades_staff_rw on grades
  for all using (
    exists (
      select 1
      from submissions s
      join assignments a on a.id = s.assignment_id
      join course_teachers ct on ct.course_id = a.course_id and ct.teacher_id = auth.uid()
      where s.id = grades.submission_id
    )
    or exists (
      select 1 from profiles p where p.user_id = auth.uid() and (p.is_admin = true or lower(coalesce(p.role,'')) = 'admin')
    )
  );

create policy if not exists grades_students_read on grades
  for select using (
    exists (
      select 1
      from submissions s
      where s.id = grades.submission_id and s.student_id = auth.uid()
    )
  );
