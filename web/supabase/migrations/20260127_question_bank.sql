-- Question Bank core tables
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('verbal','math')),
  topic text not null,
  subtopic text,
  stem text not null,
  type text not null default 'mcq' check (type in ('mcq')),
  difficulty text check (difficulty in ('easy','medium','hard')),
  published boolean not null default true,
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  label text not null,
  content text not null,
  is_correct boolean not null default false,
  order_no int not null default 0
);

create index if not exists questions_subject_topic_idx on questions(subject, topic, subtopic);
create index if not exists question_choices_question_idx on question_choices(question_id);

-- RLS
alter table questions enable row level security;
alter table question_choices enable row level security;

-- Helper: simple staff check (admin/teacher)
create or replace function public.is_staff(uid uuid) returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.user_id = uid
      and (p.is_admin = true or lower(coalesce(p.role,'')) in ('admin','teacher'))
  );
$$ language sql stable;

-- Policies
drop policy if exists questions_select_all on questions;
drop policy if exists questions_write_staff on questions;
drop policy if exists question_choices_select_all on question_choices;
drop policy if exists question_choices_write_staff on question_choices;

create policy questions_select_all on questions
  for select using (
    published = true or is_staff(auth.uid())
  );

create policy questions_write_staff on questions
  for all using (is_staff(auth.uid()));

create policy question_choices_select_all on question_choices
  for select using (
    exists (select 1 from questions q where q.id = question_choices.question_id and (q.published = true or is_staff(auth.uid())))
  );

create policy question_choices_write_staff on question_choices
  for all using (
    is_staff(auth.uid())
  );
