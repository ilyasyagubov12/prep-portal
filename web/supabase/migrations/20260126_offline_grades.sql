-- Offline grades: manual (no submission) grading per course/student
create table if not exists offline_grades (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  student_id uuid not null references profiles(user_id) on delete cascade,
  title text not null default 'Offline grade',
  max_score numeric,
  score numeric,
  feedback text,
  graded_at timestamptz not null default now()
);

-- Indexes
create index if not exists offline_grades_course_idx on offline_grades(course_id);
create index if not exists offline_grades_student_idx on offline_grades(student_id);

-- RLS
alter table offline_grades enable row level security;

-- Policies (drop first to avoid conflicts)
drop policy if exists offline_grades_students_read on offline_grades;
drop policy if exists offline_grades_staff_all on offline_grades;

create policy offline_grades_students_read on offline_grades
  for select using (auth.uid() = student_id);

create policy offline_grades_staff_all on offline_grades
  for all using (
    exists (
      select 1
      from profiles p
      left join course_teachers ct on ct.teacher_id = p.user_id and ct.course_id = offline_grades.course_id
      where p.user_id = auth.uid()
        and (p.is_admin = true or lower(coalesce(p.role,'')) in ('admin','teacher'))
        and (p.is_admin = true or ct.id is not null or lower(coalesce(p.role,'')) = 'admin')
    )
  );
