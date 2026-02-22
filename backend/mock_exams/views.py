import random
import re
from django.db import models, transaction
from types import SimpleNamespace
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, Profile
from question_bank.models import Question
from .models import MockExam, MockExamAttempt, MockExamAccess


def _is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    is_admin = getattr(prof, "is_admin", False)
    return user.is_superuser or is_admin or role in ("admin", "teacher")


def _serialize_question_for_student(q: Question, choice_order: list | None = None):
    choices = []
    raw_choices = q.choices or []
    if choice_order:
        if all(isinstance(i, int) for i in choice_order):
            ordered = [i for i in choice_order if 0 <= i < len(raw_choices)]
            used = set(ordered)
            for idx, raw_idx in enumerate(ordered):
                c = raw_choices[raw_idx]
                label = chr(65 + idx)
                choices.append({"label": label, "content": c.get("content")})
            for raw_idx, c in enumerate(raw_choices):
                if raw_idx in used:
                    continue
                label = chr(65 + len(choices))
                choices.append({"label": label, "content": c.get("content")})
        else:
            by_label = {c.get("label"): c for c in raw_choices if c.get("label")}
            used = set()
            for idx, lbl in enumerate(choice_order):
                c = by_label.get(lbl)
                if not c:
                    continue
                fallback = chr(65 + idx)
                choices.append({"label": c.get("label") or fallback, "content": c.get("content")})
                used.add(lbl)
            for c in raw_choices:
                label = c.get("label") or chr(65 + len(choices))
                if c.get("label") and c.get("label") in used:
                    continue
                choices.append({"label": label, "content": c.get("content")})
    else:
        for idx, c in enumerate(raw_choices):
            label = c.get("label") or chr(65 + idx)
            choices.append({"label": label, "content": c.get("content")})

    return {
        "id": str(q.id),
        "subject": q.subject,
        "topic": q.topic,
        "subtopic": q.subtopic,
        "stem": q.stem,
        "passage": q.passage,
        "choices": choices,
        "is_open_ended": q.is_open_ended,
        "image_url": q.image_url,
        "difficulty": q.difficulty,
    }


def _serialize_question_for_review(q: Question, choice_order: list | None = None):
    choices = []
    raw_choices = q.choices or []
    if choice_order:
        if all(isinstance(i, int) for i in choice_order):
            ordered = [i for i in choice_order if 0 <= i < len(raw_choices)]
            used = set(ordered)
            for idx, raw_idx in enumerate(ordered):
                c = raw_choices[raw_idx]
                label = chr(65 + idx)
                choices.append(
                    {
                        "label": label,
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                    }
                )
            for raw_idx, c in enumerate(raw_choices):
                if raw_idx in used:
                    continue
                label = chr(65 + len(choices))
                choices.append(
                    {
                        "label": label,
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                    }
                )
        else:
            by_label = {c.get("label"): c for c in raw_choices if c.get("label")}
            used = set()
            for idx, lbl in enumerate(choice_order):
                c = by_label.get(lbl)
                if not c:
                    continue
                fallback = chr(65 + idx)
                choices.append(
                    {
                        "label": c.get("label") or fallback,
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                    }
                )
                used.add(lbl)
            for c in raw_choices:
                label = c.get("label")
                if label and label in used:
                    continue
                choices.append(
                    {
                        "label": label or chr(65 + len(choices)),
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                    }
                )
    else:
        for idx, c in enumerate(raw_choices):
            choices.append(
                {
                    "label": c.get("label") or chr(65 + idx),
                    "content": c.get("content"),
                    "is_correct": bool(c.get("is_correct")),
                }
            )

    return {
        "id": str(q.id),
        "subject": q.subject,
        "topic": q.topic,
        "subtopic": q.subtopic,
        "stem": q.stem,
        "passage": q.passage,
        "choices": choices,
        "is_open_ended": q.is_open_ended,
        "correct_answer": q.correct_answer,
        "image_url": q.image_url,
        "difficulty": q.difficulty,
    }


def _apply_override(q: Question, override: dict | None):
    if not override:
        return q
    data = {
        "id": str(q.id),
        "subject": q.subject,
        "topic": q.topic,
        "subtopic": q.subtopic,
        "stem": q.stem,
        "passage": q.passage,
        "choices": q.choices,
        "is_open_ended": q.is_open_ended,
        "correct_answer": q.correct_answer,
        "explanation": q.explanation,
        "image_url": q.image_url,
        "difficulty": q.difficulty,
    }
    for key in list(data.keys()):
        if key in override:
            data[key] = override.get(key)
    return SimpleNamespace(**data)


def _score_answers(question_map: dict, answers: dict, choice_order: dict | None = None):
    totals = {"verbal": {"correct": 0, "total": 0}, "math": {"correct": 0, "total": 0}}
    topic_stats = {}
    diff_stats = {}
    order_map = choice_order or {}

    for qid, q in question_map.items():
        if qid not in answers:
            continue
        subject = q.subject
        totals[subject]["total"] += 1

        is_correct = False
        if q.is_open_ended:
            expected = (q.correct_answer or "").strip().lower()
            actual = str(answers.get(qid) or "").strip().lower()
            if expected and actual == expected:
                is_correct = True
        else:
            pick = str(answers.get(qid) or "").strip()
            raw_choices = q.choices or []
            order = order_map.get(str(qid)) or order_map.get(qid) or []
            if order and all(isinstance(i, int) for i in order):
                idx = ord(pick.upper()) - 65 if pick else -1
                if 0 <= idx < len(order):
                    raw_idx = order[idx]
                    if 0 <= raw_idx < len(raw_choices) and raw_choices[raw_idx].get("is_correct"):
                        is_correct = True
            else:
                correct_label = next(
                    (c.get("label") for c in raw_choices if c.get("is_correct")), None
                )
                if pick and correct_label and pick == correct_label:
                    is_correct = True

        if is_correct:
            totals[subject]["correct"] += 1

        topic_key = f"{subject}:{q.topic}"
        t = topic_stats.get(topic_key) or {"correct": 0, "total": 0}
        t["total"] += 1
        if is_correct:
            t["correct"] += 1
        topic_stats[topic_key] = t

        diff = (q.difficulty or "unknown").lower()
        diff_key = f"{subject}:{diff}"
        d = diff_stats.get(diff_key) or {"correct": 0, "total": 0}
        d["total"] += 1
        if is_correct:
            d["correct"] += 1
        diff_stats[diff_key] = d

    return totals, topic_stats, diff_stats


def _check_answer(q, answer_value):
    if q.is_open_ended:
        expected = (q.correct_answer or "").strip()
        actual = str(answer_value or "").strip()
        if expected and actual:
            return expected.lower() == actual.lower(), expected, actual, None, None
        return False, expected, actual, None, None

    pick = str(answer_value or "").strip()
    correct_choice = next((c for c in (q.choices or []) if c.get("is_correct")), None)
    correct_label = correct_choice.get("label") if correct_choice else None
    correct_text = correct_choice.get("content") if correct_choice else None
    picked_choice = next((c for c in (q.choices or []) if c.get("label") == pick), None)
    picked_text = picked_choice.get("content") if picked_choice else None
    is_correct = bool(pick and correct_label and pick == correct_label)
    return is_correct, correct_label, pick, correct_text, picked_text


def _build_question_map_for_exam(exam: MockExam):
    overrides = exam.question_overrides or {}
    qs = Question.objects.filter(id__in=(exam.question_ids or []))
    return {str(q.id): _apply_override(q, overrides.get(str(q.id))) for q in qs}


def _validate_counts(verbal_count: int, math_count: int):
    if verbal_count < 0 or math_count < 0:
        return "Question counts must be 0 or greater"
    return None


def _update_exam_counts(exam: MockExam):
    qs = Question.objects.filter(id__in=(exam.question_ids or []))
    exam.verbal_question_count = qs.filter(subject="verbal").count()
    exam.math_question_count = qs.filter(subject="math").count()
    exam.save(update_fields=["verbal_question_count", "math_question_count"])


def _random_sample(qs, count, exclude_ids):
    ids = list(qs.exclude(id__in=exclude_ids).values_list("id", flat=True))
    if len(ids) < count:
        return None, len(ids)
    return random.sample(ids, count), len(ids)


def _apply_topic_filter(qs, topics: list[str]):
    if not topics:
        return qs
    q = models.Q()
    for t in topics:
        if t:
            q |= models.Q(topic__iexact=t.strip())
    return qs.filter(q)


def _apply_subtopic_filter(qs, subtopics: list[str]):
    if not subtopics:
        return qs
    q = models.Q()
    for s in subtopics:
        if s:
            q |= models.Q(subtopic__iexact=s.strip())
    return qs.filter(q)


def _parse_command(command: str):
    if not command:
        return []
    segments = re.split(r"\s+and\s+", command, flags=re.IGNORECASE)
    rules = []
    for segment in segments:
        text = segment.strip()
        if not text:
            continue
        count_match = re.search(r"(\d+)", text)
        if not count_match:
            continue
        count = int(count_match.group(1))
        subject = None
        if re.search(r"\bverbal\b", text, flags=re.IGNORECASE):
            subject = "verbal"
        elif re.search(r"\bmath\b", text, flags=re.IGNORECASE):
            subject = "math"
        difficulty = None
        for d in ["easy", "medium", "hard", "mixed"]:
            if re.search(rf"\b{d}\b", text, flags=re.IGNORECASE):
                difficulty = None if d == "mixed" else d
                break
        topics = []
        from_match = re.search(r"from\s+(.*)", text, flags=re.IGNORECASE)
        if from_match:
            topic_part = from_match.group(1)
            topic_part = re.sub(r"\(.*?\)", "", topic_part)
            topic_part = topic_part.replace("questions", "").replace("question", "")
            for piece in re.split(r",|&|/| and ", topic_part):
                t = piece.strip()
                if t:
                    topics.append(t)

        rules.append(
            {
                "subject": subject,
                "topics": topics,
                "difficulty": difficulty,
                "count": count,
            }
        )
    return rules


def _generate_question_ids(rules, exclude_ids=None):
    selected_ids = []
    errors = []
    base_excludes = {str(i) for i in (exclude_ids or [])}

    for idx, rule in enumerate(rules, start=1):
        subject = (rule.get("subject") or "").lower()
        if subject not in ("verbal", "math"):
            errors.append(f"Rule {idx}: subject must be verbal or math")
            continue
        count = int(rule.get("count") or 0)
        if count <= 0:
            errors.append(f"Rule {idx}: count must be greater than 0")
            continue

        qs = Question.objects.filter(subject=subject, published=True)
        topics = rule.get("topics") or []
        qs = _apply_topic_filter(qs, topics)
        subtopics = rule.get("subtopics") or []
        subtopic_single = rule.get("subtopic")
        if subtopic_single and subtopic_single not in subtopics:
            subtopics = [subtopic_single]
        qs = _apply_subtopic_filter(qs, subtopics)
        difficulty = (rule.get("difficulty") or "").strip().lower()
        if difficulty:
            qs = qs.filter(difficulty__iexact=difficulty)

        exclude = list(base_excludes.union(selected_ids))
        picked, available = _random_sample(qs, count, exclude)
        if picked is None:
            errors.append(f"Rule {idx}: only {available} matching questions (need {count})")
            continue

        selected_ids.extend([str(pid) for pid in picked])

    if errors:
        return None, errors

    return selected_ids, []


class MockExamListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        staff = _is_staff(user)
        prof = getattr(user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        course_id = request.query_params.get("course_id")

        exams = MockExam.objects.select_related("course").order_by("-created_at")
        if course_id:
            exams = exams.filter(course_id=course_id)
        data = []
        for exam in exams:
            if staff and not is_admin:
                if exam.course_id:
                    from courses.models import CourseTeacher

                    if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=user).exists():
                        continue
                else:
                    if exam.created_by_id != user.id:
                        continue
            access_qs = MockExamAccess.objects.filter(mock_exam=exam, is_active=True)
            locked = False
            has_access = True
            if not staff:
                if exam.course_id:
                    from courses.models import Enrollment

                    if not Enrollment.objects.filter(course_id=exam.course_id, user=user).exists():
                        continue
                if access_qs.exists():
                    has_access = access_qs.filter(student=user).exists()
                elif exam.allowed_students.exists():
                    has_access = exam.allowed_students.filter(id=user.id).exists()
                else:
                    has_access = True
                if not has_access:
                    continue
                if not exam.is_active:
                    locked = True
            else:
                locked = False

            latest_attempt = (
                MockExamAttempt.objects.filter(mock_exam=exam, student=user)
                .order_by("-started_at")
                .first()
            )
            attempts_count = MockExamAttempt.objects.filter(
                mock_exam=exam, student=user, status="submitted"
            ).count()
            attempt_summary = None
            if latest_attempt and (exam.results_published or staff):
                attempt_summary = {
                    "id": str(latest_attempt.id),
                    "status": latest_attempt.status,
                    "score_verbal": latest_attempt.score_verbal,
                    "score_math": latest_attempt.score_math,
                    "total_score": latest_attempt.total_score,
                    "submitted_at": latest_attempt.submitted_at,
                }

            allowed_ids = None
            allowed_count = None
            if staff:
                if access_qs.exists():
                    allowed_ids = list(access_qs.values_list("student_id", flat=True))
                    allowed_count = access_qs.count()
                else:
                    allowed_ids = list(exam.allowed_students.values_list("id", flat=True))
                    allowed_count = exam.allowed_students.count()
            access_limit = None
            if access_qs.exists():
                access_row = access_qs.filter(student=user).first()
                if access_row:
                    access_limit = access_row.attempt_limit

            data.append(
                {
                    "id": str(exam.id),
                    "course_id": str(exam.course_id) if exam.course_id else None,
                    "course_title": exam.course.title if exam.course_id else None,
                    "course_slug": exam.course.slug if exam.course_id else None,
                    "title": exam.title,
                    "description": exam.description,
                    "verbal_question_count": exam.verbal_question_count,
                    "math_question_count": exam.math_question_count,
                    "total_time_minutes": exam.total_time_minutes,
                    "shuffle_questions": exam.shuffle_questions,
                    "shuffle_choices": exam.shuffle_choices,
                    "allow_retakes": exam.allow_retakes,
                    "retake_limit": exam.retake_limit,
                    "is_active": exam.is_active,
                    "results_published": exam.results_published,
                    "locked": locked,
                    "question_count": len(exam.question_ids or []),
                    "allowed_student_ids": allowed_ids,
                    "allowed_student_count": allowed_count,
                    "question_ids": exam.question_ids if staff else None,
                    "attempt": attempt_summary,
                    "attempts_count": attempts_count,
                    "access_limit": access_limit,
                }
            )

        return Response({"ok": True, "exams": data})


class MockExamReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        attempt_id = request.query_params.get("attempt_id")
        exam_id = request.query_params.get("mock_exam_id")
        user = request.user
        staff = _is_staff(user)
        if attempt_id:
            if not staff:
                return Response({"error": "Forbidden"}, status=403)
            try:
                attempt = MockExamAttempt.objects.select_related("mock_exam", "mock_exam__course").get(
                    id=attempt_id
                )
            except MockExamAttempt.DoesNotExist:
                return Response({"error": "Not found"}, status=404)
            exam = attempt.mock_exam
            prof = getattr(user, "profile", None)
            role = (getattr(prof, "role", None) or "").lower()
            is_admin = user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
            if not is_admin:
                if exam.course_id:
                    from courses.models import CourseTeacher

                    if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=user).exists():
                        return Response({"error": "Forbidden"}, status=403)
                elif exam.created_by_id != user.id:
                    return Response({"error": "Forbidden"}, status=403)
        else:
            if not exam_id:
                return Response({"error": "mock_exam_id required"}, status=400)
            try:
                exam = MockExam.objects.get(id=exam_id)
            except MockExam.DoesNotExist:
                return Response({"error": "Not found"}, status=404)
            if not exam.results_published and not staff:
                return Response({"error": "Results not published"}, status=403)

            attempt = (
                MockExamAttempt.objects.filter(mock_exam=exam, student=user, status="submitted")
                .order_by("-submitted_at")
                .first()
            )
            if not attempt:
                return Response({"error": "No submitted attempt"}, status=404)

        overrides = exam.question_overrides or {}
        questions = Question.objects.filter(id__in=attempt.question_order)
        by_id = {str(q.id): q for q in questions}
        payload = []
        for qid in attempt.question_order:
            q = by_id.get(str(qid))
            if not q:
                continue
            q2 = _apply_override(q, overrides.get(str(q.id)))
            payload.append(_serialize_question_for_review(q2, attempt.choice_order.get(str(q.id))))

        return Response(
            {
                "ok": True,
                "review": True,
                "attempt_id": str(attempt.id),
                "mock_exam": {
                    "id": str(exam.id),
                    "title": exam.title,
                    "description": exam.description,
                    "verbal_question_count": exam.verbal_question_count,
                    "math_question_count": exam.math_question_count,
                    "total_time_minutes": exam.total_time_minutes,
                },
                "questions": payload,
                "answers": attempt.answers,
                "time_spent": attempt.time_spent,
                "submitted_at": attempt.submitted_at,
                "score_verbal": attempt.score_verbal,
                "score_math": attempt.score_math,
                "total_score": attempt.total_score,
            }
        )


class MockExamAttemptsReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.query_params.get("mock_exam_id")
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)
        try:
            exam = MockExam.objects.select_related("course").get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        user = request.user
        prof = getattr(user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        if not is_admin:
            if exam.course_id:
                from courses.models import CourseTeacher

                if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=user).exists():
                    return Response({"error": "Forbidden"}, status=403)
            elif exam.created_by_id != user.id:
                return Response({"error": "Forbidden"}, status=403)

        attempts_qs = MockExamAttempt.objects.filter(mock_exam=exam, status="submitted").select_related("student")
        attempts_qs = attempts_qs.order_by("-submitted_at")

        # Latest attempt per student
        latest_by_student = {}
        for attempt in attempts_qs:
            sid = str(attempt.student_id)
            if sid in latest_by_student:
                continue
            latest_by_student[sid] = attempt

        # Attempt counts per student
        counts = (
            MockExamAttempt.objects.filter(mock_exam=exam, status="submitted")
            .values("student_id")
            .annotate(count=Count("id"))
        )
        count_map = {str(c["student_id"]): c["count"] for c in counts}

        qmap = _build_question_map_for_exam(exam)

        rows = []
        for attempt in latest_by_student.values():
            student = attempt.student
            mistakes = []
            unanswered = 0
            for idx, qid in enumerate(attempt.question_order or [], start=1):
                q = qmap.get(str(qid))
                if not q:
                    continue
                answer_value = attempt.answers.get(str(qid))
                if answer_value in (None, ""):
                    unanswered += 1
                    mistakes.append(
                        {
                            "index": idx,
                            "question_id": str(qid),
                            "subject": q.subject,
                            "topic": q.topic,
                            "subtopic": q.subtopic,
                            "stem": q.stem,
                            "status": "unanswered",
                            "correct": q.correct_answer if q.is_open_ended else None,
                            "correct_label": None,
                            "correct_text": None,
                            "answer": None,
                            "answer_text": None,
                            "is_open_ended": q.is_open_ended,
                        }
                    )
                    continue

                is_correct, correct_label, picked_label, correct_text, picked_text = _check_answer(q, answer_value)
                if is_correct:
                    continue
                mistakes.append(
                    {
                        "index": idx,
                        "question_id": str(qid),
                        "subject": q.subject,
                        "topic": q.topic,
                        "subtopic": q.subtopic,
                        "stem": q.stem,
                        "status": "incorrect",
                        "correct": q.correct_answer if q.is_open_ended else correct_label,
                        "correct_label": correct_label,
                        "correct_text": correct_text,
                        "answer": picked_label if not q.is_open_ended else str(answer_value),
                        "answer_text": picked_text if not q.is_open_ended else str(answer_value),
                        "is_open_ended": q.is_open_ended,
                    }
                )

            rows.append(
                {
                    "attempt_id": str(attempt.id),
                    "student_profile": {
                        "user_id": str(student.id),
                        "username": getattr(student, "username", None),
                        "first_name": getattr(student, "first_name", None),
                        "last_name": getattr(student, "last_name", None),
                        "nickname": getattr(getattr(student, "profile", None), "nickname", None),
                        "student_id": getattr(getattr(student, "profile", None), "student_id", None),
                    },
                    "attempts_count": count_map.get(str(student.id), 0),
                    "score_verbal": attempt.score_verbal,
                    "score_math": attempt.score_math,
                    "total_score": attempt.total_score,
                    "submitted_at": attempt.submitted_at,
                    "time_spent": attempt.time_spent,
                    "mistakes": mistakes,
                    "unanswered": unanswered,
                }
            )

        return Response({"ok": True, "attempts": rows})


class MockExamQuestionSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        subject = request.query_params.get("subject")
        topic = request.query_params.get("topic")
        subtopic = request.query_params.get("subtopic")
        difficulty = request.query_params.get("difficulty")
        query = request.query_params.get("q")
        limit = int(request.query_params.get("limit") or 200)

        qs = Question.objects.all()
        if subject:
            qs = qs.filter(subject=subject)
        if topic:
            qs = qs.filter(topic__iexact=topic)
        if subtopic:
            qs = qs.filter(subtopic__iexact=subtopic)
        if difficulty:
            qs = qs.filter(difficulty__iexact=difficulty)
        if query:
            qs = qs.filter(models.Q(stem__icontains=query) | models.Q(passage__icontains=query))

        qs = qs.order_by("-created_at")[: max(1, min(limit, 500))]

        results = []
        for q in qs:
            results.append(
                {
                    "id": str(q.id),
                    "subject": q.subject,
                    "topic": q.topic,
                    "subtopic": q.subtopic,
                    "difficulty": q.difficulty,
                    "stem": q.stem,
                    "published": q.published,
                }
            )

        return Response({"ok": True, "questions": results})


class MockExamTopicMapView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        rows = (
            Question.objects.filter(published=True)
            .values("subject", "topic", "subtopic")
            .annotate(count=Count("id"))
        )
        subjects: dict[str, dict[str, dict]] = {"verbal": {}, "math": {}}
        for row in rows:
            subject = row.get("subject") or "verbal"
            topic = row.get("topic") or "General"
            subtopic = row.get("subtopic")
            count = row.get("count") or 0
            subject_bucket = subjects.setdefault(subject, {})
            topic_entry = subject_bucket.get(topic)
            if not topic_entry:
                topic_entry = {"topic": topic, "count": 0, "subtopics": []}
                subject_bucket[topic] = topic_entry
            topic_entry["count"] += count
            if subtopic:
                topic_entry["subtopics"].append({"subtopic": subtopic, "count": count})

        def normalize(subject: str):
            topics = list(subjects.get(subject, {}).values())
            topics.sort(key=lambda t: t["topic"].lower())
            for t in topics:
                t["subtopics"].sort(key=lambda s: s["subtopic"].lower())
            return topics

        return Response(
            {
                "ok": True,
                "subjects": {
                    "verbal": normalize("verbal"),
                    "math": normalize("math"),
                },
            }
        )


class MockExamQuestionLookupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        question_ids = request.data.get("question_ids") or []
        exam_id = request.data.get("mock_exam_id")
        include_full = bool(request.data.get("full") or exam_id)
        if not isinstance(question_ids, list):
            return Response({"error": "question_ids must be a list"}, status=400)

        overrides = {}
        if exam_id:
            try:
                exam = MockExam.objects.get(id=exam_id)
            except MockExam.DoesNotExist:
                return Response({"error": "Mock exam not found"}, status=404)
            overrides = exam.question_overrides or {}

        qs = Question.objects.filter(id__in=question_ids)
        by_id = {str(q.id): q for q in qs}
        ordered = []
        for qid in question_ids:
            q = by_id.get(str(qid))
            if not q:
                continue
            override = overrides.get(str(qid))
            if include_full:
                q2 = _apply_override(q, override)
                ordered.append(
                    {
                        "id": str(q.id),
                        "subject": q2.subject,
                        "topic": q2.topic,
                        "subtopic": q2.subtopic,
                        "difficulty": q2.difficulty,
                        "stem": q2.stem,
                        "passage": q2.passage,
                        "choices": q2.choices,
                        "is_open_ended": q2.is_open_ended,
                        "image_url": q2.image_url,
                        "explanation": q2.explanation,
                        "override": override or None,
                        "published": q.published,
                    }
                )
                continue
            ordered.append(
                {
                    "id": str(q.id),
                    "subject": q.subject,
                    "topic": q.topic,
                    "subtopic": q.subtopic,
                    "difficulty": q.difficulty,
                    "stem": q.stem,
                    "published": q.published,
                }
            )

        return Response({"ok": True, "questions": ordered})


class MockExamQuestionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        question_id = request.data.get("question_id")
        if not exam_id or not question_id:
            return Response({"error": "mock_exam_id and question_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Mock exam not found"}, status=404)

        try:
            q = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({"error": "Question not found"}, status=404)

        override = (exam.question_overrides or {}).get(str(question_id))
        q2 = _apply_override(q, override)
        return Response(
            {
                "ok": True,
                "question": {
                    "id": str(q.id),
                    "subject": q2.subject,
                    "topic": q2.topic,
                    "subtopic": q2.subtopic,
                    "difficulty": q2.difficulty,
                    "stem": q2.stem,
                    "passage": q2.passage,
                    "choices": q2.choices,
                    "is_open_ended": q2.is_open_ended,
                    "correct_answer": q2.correct_answer,
                    "image_url": q2.image_url,
                    "explanation": q2.explanation,
                    "override": override or None,
                },
            }
        )


class MockExamStudentSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        q = (request.data.get("q") or "").strip().lower()
        limit = int(request.data.get("limit") or 50)
        exam_id = request.data.get("mock_exam_id")
        attempt_counts: dict[str, int] = {}
        access_limits: dict[str, int | None] = {}
        if exam_id:
            rows = (
                MockExamAttempt.objects.filter(mock_exam_id=exam_id, status="submitted")
                .values("student_id")
                .annotate(count=Count("id"))
            )
            attempt_counts = {str(r["student_id"]): r["count"] for r in rows}
            access_rows = MockExamAccess.objects.filter(mock_exam_id=exam_id, is_active=True).values(
                "student_id", "attempt_limit"
            )
            access_limits = {str(r["student_id"]): r["attempt_limit"] for r in access_rows}

        qs = Profile.objects.select_related("user").filter(role="student")
        if q:
            qs = qs.filter(
                models.Q(nickname__icontains=q)
                | models.Q(user__username__icontains=q)
                | models.Q(user__first_name__icontains=q)
                | models.Q(user__last_name__icontains=q)
                | models.Q(student_id__icontains=q)
            )

        qs = qs.order_by("nickname")[: max(1, min(limit, 200))]
        data = []
        for p in qs:
            data.append(
                {
                    "user_id": str(p.user.id),
                    "username": p.user.username,
                    "first_name": p.user.first_name,
                    "last_name": p.user.last_name,
                    "nickname": p.nickname,
                    "student_id": p.student_id,
                    "avatar": p.avatar,
                    "attempts_count": attempt_counts.get(str(p.user.id), 0),
                    "access_limit": access_limits.get(str(p.user.id)),
                }
            )
        return Response({"ok": True, "students": data})


class MockExamStudentLookupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        student_ids = request.data.get("student_ids") or []
        exam_id = request.data.get("mock_exam_id")
        if not isinstance(student_ids, list):
            return Response({"error": "student_ids must be list"}, status=400)

        attempt_counts: dict[str, int] = {}
        access_limits: dict[str, int | None] = {}
        if exam_id:
            rows = (
                MockExamAttempt.objects.filter(mock_exam_id=exam_id, status="submitted", student_id__in=student_ids)
                .values("student_id")
                .annotate(count=Count("id"))
            )
            attempt_counts = {str(r["student_id"]): r["count"] for r in rows}
            access_rows = MockExamAccess.objects.filter(
                mock_exam_id=exam_id, is_active=True, student_id__in=student_ids
            ).values("student_id", "attempt_limit")
            access_limits = {str(r["student_id"]): r["attempt_limit"] for r in access_rows}

        qs = Profile.objects.select_related("user").filter(user_id__in=student_ids)
        data = []
        for p in qs:
            data.append(
                {
                    "user_id": str(p.user.id),
                    "username": p.user.username,
                    "first_name": p.user.first_name,
                    "last_name": p.user.last_name,
                    "nickname": p.nickname,
                    "student_id": p.student_id,
                    "avatar": p.avatar,
                    "attempts_count": attempt_counts.get(str(p.user.id), 0),
                    "access_limit": access_limits.get(str(p.user.id)),
                }
            )
        return Response({"ok": True, "students": data})


class MockExamAccessSetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        student_ids = request.data.get("student_ids") or []
        student_limits = request.data.get("student_limits") or {}
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not isinstance(student_ids, list):
            return Response({"error": "student_ids must be list"}, status=400)
        if not isinstance(student_limits, dict):
            return Response({"error": "student_limits must be dict"}, status=400)

        students = User.objects.filter(id__in=student_ids)
        exam.allowed_students.set(students)
        MockExamAccess.objects.filter(mock_exam=exam).delete()

        access_rows = []
        for student in students:
            limit = student_limits.get(str(student.id))
            if limit in (None, "", "null"):
                parsed_limit = None
            else:
                try:
                    parsed_limit = int(limit)
                except Exception:
                    return Response({"error": "student_limits must contain integers"}, status=400)
                if parsed_limit < 1:
                    return Response({"error": "student_limits must be >= 1"}, status=400)

            access_rows.append(
                MockExamAccess(
                    mock_exam=exam,
                    student=student,
                    granted_by=request.user,
                    is_active=True,
                    attempt_limit=parsed_limit,
                )
            )

        if access_rows:
            MockExamAccess.objects.bulk_create(access_rows)

        return Response({"ok": True, "allowed_student_count": students.count()})


class MockExamCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        title = (request.data.get("title") or "").strip()
        description = request.data.get("description") or None
        course_id = request.data.get("course_id")
        total_time = int(request.data.get("total_time_minutes") or 0)
        shuffle_questions = bool(request.data.get("shuffle_questions", True))
        shuffle_choices = bool(request.data.get("shuffle_choices", False))
        allow_retakes = bool(request.data.get("allow_retakes", True))
        retake_limit = None
        if "retake_limit" in request.data:
            limit = request.data.get("retake_limit")
            if limit not in (None, "", "null"):
                try:
                    retake_limit = int(limit)
                except Exception:
                    return Response({"error": "retake_limit must be an integer"}, status=400)
                if retake_limit < 1:
                    return Response({"error": "retake_limit must be at least 1"}, status=400)

        if not title:
            return Response({"error": "title required"}, status=400)
        if total_time <= 0:
            return Response({"error": "total_time_minutes must be greater than 0"}, status=400)

        question_ids = request.data.get("question_ids") or []
        rules = request.data.get("rules") or []
        command = request.data.get("command") or ""

        if question_ids:
            if len(question_ids) != len(set(question_ids)):
                return Response({"error": "Duplicate questions detected"}, status=400)
        elif rules:
            question_ids, errors = _generate_question_ids(rules, exclude_ids=[])
            if errors:
                return Response({"error": " | ".join(errors)}, status=400)
        elif command:
            parsed = _parse_command(command)
            if not parsed:
                return Response({"error": "Could not parse command"}, status=400)
            question_ids, errors = _generate_question_ids(parsed, exclude_ids=[])
            if errors:
                return Response({"error": " | ".join(errors)}, status=400)
        else:
            question_ids = []

        verbal_count = 0
        math_count = 0
        if question_ids:
            qs = Question.objects.filter(id__in=question_ids)
            verbal_count = qs.filter(subject="verbal").count()
            math_count = qs.filter(subject="math").count()

        exam = MockExam.objects.create(
            course_id=course_id or None,
            title=title,
            description=description,
            verbal_question_count=verbal_count,
            math_question_count=math_count,
            total_time_minutes=total_time,
            shuffle_questions=shuffle_questions,
            shuffle_choices=shuffle_choices,
            allow_retakes=allow_retakes,
            retake_limit=retake_limit,
            question_ids=question_ids,
            created_by=request.user,
        )

        return Response({"ok": True, "mock_exam_id": str(exam.id)})


class MockExamUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        fields = [
            "title",
            "description",
            "total_time_minutes",
            "shuffle_questions",
            "shuffle_choices",
            "allow_retakes",
            "is_active",
            "results_published",
        ]
        for f in fields:
            if f in request.data:
                setattr(exam, f, request.data.get(f))
        if "retake_limit" in request.data:
            limit = request.data.get("retake_limit")
            if limit in (None, "", "null"):
                exam.retake_limit = None
            else:
                try:
                    exam.retake_limit = int(limit)
                except Exception:
                    return Response({"error": "retake_limit must be an integer"}, status=400)
                if exam.retake_limit < 1:
                    return Response({"error": "retake_limit must be at least 1"}, status=400)
        exam.save()

        return Response({"ok": True})


class MockExamDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        exam_id = request.data.get("mock_exam_id")
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)
        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
        if exam.course_id:
            try:
                from courses.models import CourseNode

                CourseNode.objects.filter(quiz_id=exam.id).delete()
            except Exception:
                pass
        exam.delete()
        return Response({"ok": True})


class MockExamQuestionsSetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        question_ids = request.data.get("question_ids") or []
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)
        if not isinstance(question_ids, list) or not question_ids:
            return Response({"error": "question_ids required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if len(question_ids) != len(set(question_ids)):
            return Response({"error": "Duplicate questions detected"}, status=400)

        exam.question_ids = question_ids
        exam.save(update_fields=["question_ids"])
        _update_exam_counts(exam)
        return Response({"ok": True})


class MockExamQuestionsGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)
        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        rules = request.data.get("rules") or []
        command = request.data.get("command") or ""
        if command:
            rules = _parse_command(command)
            if not rules:
                return Response({"error": "Could not parse command"}, status=400)

        if not rules:
            return Response({"error": "rules or command required"}, status=400)

        append_mode = request.data.get("append", True)
        if isinstance(append_mode, str):
            append_mode = append_mode.lower() not in ("0", "false", "no")

        existing_ids = list(exam.question_ids or [])
        question_ids, errors = _generate_question_ids(rules, exclude_ids=existing_ids if append_mode else [])
        if errors:
            return Response({"error": " | ".join(errors)}, status=400)

        if append_mode:
            merged = existing_ids + [qid for qid in question_ids if qid not in existing_ids]
        else:
            merged = question_ids

        exam.question_ids = merged
        exam.save(update_fields=["question_ids"])
        _update_exam_counts(exam)
        return Response({"ok": True, "question_ids": exam.question_ids})


class MockExamQuestionAddView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        question_id = request.data.get("question_id")
        if not exam_id or not question_id:
            return Response({"error": "mock_exam_id and question_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        prof = getattr(request.user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = request.user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        if not is_admin:
            if exam.course_id:
                from courses.models import CourseTeacher

                if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=request.user).exists():
                    return Response({"error": "Forbidden"}, status=403)
            elif exam.created_by_id != request.user.id:
                return Response({"error": "Forbidden"}, status=403)

        try:
            q = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({"error": "Question not found"}, status=404)

        existing = list(exam.question_ids or [])
        if question_id in existing:
            return Response({"error": "Question already added"}, status=400)

        next_ids = existing + [question_id]

        exam.question_ids = next_ids
        exam.save(update_fields=["question_ids"])
        _update_exam_counts(exam)
        return Response({"ok": True, "question_ids": next_ids})


class MockExamQuestionRemoveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        question_id = request.data.get("question_id")
        if not exam_id or not question_id:
            return Response({"error": "mock_exam_id and question_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        prof = getattr(request.user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = request.user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        if not is_admin:
            if exam.course_id:
                from courses.models import CourseTeacher

                if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=request.user).exists():
                    return Response({"error": "Forbidden"}, status=403)
            elif exam.created_by_id != request.user.id:
                return Response({"error": "Forbidden"}, status=403)

        existing = list(exam.question_ids or [])
        if question_id not in existing:
            return Response({"error": "Question not in mock"}, status=400)

        next_ids = [qid for qid in existing if str(qid) != str(question_id)]
        overrides = exam.question_overrides or {}
        overrides.pop(str(question_id), None)
        exam.question_overrides = overrides
        exam.question_ids = next_ids
        exam.save(update_fields=["question_ids", "question_overrides"])
        _update_exam_counts(exam)
        return Response({"ok": True, "question_ids": next_ids})


class MockExamQuestionReplaceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        old_id = request.data.get("old_question_id")
        new_id = request.data.get("new_question_id")
        if not exam_id or not old_id or not new_id:
            return Response({"error": "mock_exam_id, old_question_id, new_question_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        prof = getattr(request.user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = request.user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        if not is_admin:
            if exam.course_id:
                from courses.models import CourseTeacher

                if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=request.user).exists():
                    return Response({"error": "Forbidden"}, status=403)
            elif exam.created_by_id != request.user.id:
                return Response({"error": "Forbidden"}, status=403)

        if old_id == new_id:
            return Response({"error": "Replacement question is the same"}, status=400)

        try:
            new_q = Question.objects.get(id=new_id)
        except Question.DoesNotExist:
            return Response({"error": "New question not found"}, status=404)

        existing = list(exam.question_ids or [])
        if old_id not in existing:
            return Response({"error": "Old question not in mock"}, status=400)
        if new_id in existing:
            return Response({"error": "Question already in mock"}, status=400)

        next_ids = [new_id if str(qid) == str(old_id) else qid for qid in existing]

        overrides = exam.question_overrides or {}
        if str(old_id) in overrides:
            overrides.pop(str(old_id), None)
            exam.question_overrides = overrides
            exam.save(update_fields=["question_overrides"])

        exam.question_ids = next_ids
        exam.save(update_fields=["question_ids"])
        _update_exam_counts(exam)
        return Response({"ok": True, "question_ids": next_ids})


class MockExamQuestionOverrideView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        exam_id = request.data.get("mock_exam_id")
        question_id = request.data.get("question_id")
        override = request.data.get("override")
        clear = bool(request.data.get("clear"))
        if not exam_id or not question_id:
            return Response({"error": "mock_exam_id and question_id required"}, status=400)

        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        prof = getattr(request.user, "profile", None)
        role = (getattr(prof, "role", None) or "").lower()
        is_admin = request.user.is_superuser or getattr(prof, "is_admin", False) or role == "admin"
        if not is_admin:
            if exam.course_id:
                from courses.models import CourseTeacher

                if not CourseTeacher.objects.filter(course_id=exam.course_id, teacher=request.user).exists():
                    return Response({"error": "Forbidden"}, status=403)
            elif exam.created_by_id != request.user.id:
                return Response({"error": "Forbidden"}, status=403)

        if question_id not in (exam.question_ids or []):
            return Response({"error": "Question not in mock"}, status=400)

        overrides = exam.question_overrides or {}
        if clear:
            overrides.pop(str(question_id), None)
        else:
            if not isinstance(override, dict):
                return Response({"error": "override must be object"}, status=400)
            overrides[str(question_id)] = override
        exam.question_overrides = overrides
        exam.save(update_fields=["question_overrides"])
        return Response({"ok": True})


class MockExamStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        exam_id = request.data.get("mock_exam_id")
        if not exam_id:
            return Response({"error": "mock_exam_id required"}, status=400)
        try:
            exam = MockExam.objects.get(id=exam_id)
        except MockExam.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        staff = _is_staff(request.user)

        if not (exam.question_ids or []):
            return Response({"error": "No questions in this mock yet"}, status=400)

        if not exam.is_active and not staff:
            return Response({"error": "Locked"}, status=403)
        access = None
        access_qs = MockExamAccess.objects.filter(mock_exam=exam, is_active=True)
        if not staff:
            if exam.course_id:
                from courses.models import Enrollment

                if not Enrollment.objects.filter(course_id=exam.course_id, user=request.user).exists():
                    return Response({"error": "No access"}, status=403)
            if access_qs.exists():
                access = access_qs.filter(student=request.user).first()
                if not access:
                    return Response({"error": "No access"}, status=403)
            elif exam.allowed_students.exists():
                if not exam.allowed_students.filter(id=request.user.id).exists():
                    return Response({"error": "No access"}, status=403)

        user = request.user
        if not staff:
            if not exam.allow_retakes:
                existing = MockExamAttempt.objects.filter(
                    mock_exam=exam, student=user, status="submitted"
                ).first()
                if existing:
                    return Response({"error": "Retakes disabled"}, status=403)
            else:
                access_limit = access.attempt_limit if access else None
                effective_limit = access_limit if access_limit is not None else exam.retake_limit
                if effective_limit is not None:
                    submitted_count = MockExamAttempt.objects.filter(
                        mock_exam=exam, student=user, status="submitted"
                    ).count()
                    if submitted_count >= effective_limit:
                        return Response({"error": "Retake limit reached"}, status=403)
        elif exam.retake_limit is not None:
            submitted_count = MockExamAttempt.objects.filter(
                mock_exam=exam, student=user, status="submitted"
            ).count()
            if submitted_count >= exam.retake_limit:
                return Response({"error": "Retake limit reached"}, status=403)

        attempt = (
            MockExamAttempt.objects.filter(mock_exam=exam, student=user, status="in_progress")
            .order_by("-started_at")
            .first()
        )

        overrides = exam.question_overrides or {}

        if not attempt:
            attempt = MockExamAttempt.objects.create(
                mock_exam=exam,
                student=user,
                status="in_progress",
            )
            order = list(exam.question_ids or [])
            if exam.shuffle_questions:
                random.shuffle(order)
            attempt.question_order = order

            choice_order = {}
            if exam.shuffle_choices:
                qs = Question.objects.filter(id__in=order)
                for q in qs:
                    q2 = _apply_override(q, overrides.get(str(q.id)))
                    indices = list(range(len(q2.choices or [])))
                    random.shuffle(indices)
                    choice_order[str(q.id)] = indices
            attempt.choice_order = choice_order
            attempt.save()

        if not attempt.question_order:
            attempt.question_order = list(exam.question_ids or [])
            attempt.save(update_fields=["question_order"])

        questions = Question.objects.filter(id__in=attempt.question_order)
        by_id = {str(q.id): q for q in questions}
        payload = []
        for qid in attempt.question_order:
            q = by_id.get(str(qid))
            if not q:
                continue
            q2 = _apply_override(q, overrides.get(str(q.id)))
            payload.append(_serialize_question_for_student(q2, attempt.choice_order.get(str(q.id))))

        return Response(
            {
                "ok": True,
                "attempt_id": str(attempt.id),
                "mock_exam": {
                    "id": str(exam.id),
                    "title": exam.title,
                    "description": exam.description,
                    "verbal_question_count": exam.verbal_question_count,
                    "math_question_count": exam.math_question_count,
                    "total_time_minutes": exam.total_time_minutes,
                },
                "questions": payload,
                "answers": attempt.answers,
                "time_spent": attempt.time_spent,
            }
        )


class MockExamSaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        attempt_id = request.data.get("attempt_id")
        if not attempt_id:
            return Response({"error": "attempt_id required"}, status=400)
        try:
            attempt = MockExamAttempt.objects.select_related("mock_exam").get(id=attempt_id)
        except MockExamAttempt.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if attempt.student_id != request.user.id and not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        if attempt.status == "submitted":
            return Response({"error": "Already submitted"}, status=400)

        answers_payload = request.data.get("answers") or {}
        if isinstance(answers_payload, list):
            answers = {str(a.get("question_id")): a.get("answer") for a in answers_payload if a.get("question_id")}
        elif isinstance(answers_payload, dict):
            answers = {str(k): v for k, v in answers_payload.items()}
        else:
            return Response({"error": "answers must be list or dict"}, status=400)

        time_spent = request.data.get("time_spent")
        if time_spent is not None:
            try:
                attempt.time_spent = int(time_spent)
            except Exception:
                pass

        attempt.answers = answers
        attempt.save(update_fields=["answers", "time_spent"])

        return Response({"ok": True})


class MockExamSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        attempt_id = request.data.get("attempt_id")
        answers_payload = request.data.get("answers") or {}
        if not attempt_id:
            return Response({"error": "attempt_id required"}, status=400)

        try:
            attempt = MockExamAttempt.objects.select_related("mock_exam").get(id=attempt_id)
        except MockExamAttempt.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if attempt.student_id != request.user.id and not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        if attempt.status == "submitted":
            return Response({"error": "Already submitted"}, status=400)

        if isinstance(answers_payload, list):
            answers = {str(a.get("question_id")): a.get("answer") for a in answers_payload if a.get("question_id")}
        elif isinstance(answers_payload, dict):
            answers = {str(k): v for k, v in answers_payload.items()}
        else:
            return Response({"error": "answers must be list or dict"}, status=400)

        questions = Question.objects.filter(id__in=attempt.question_order)
        overrides = (attempt.mock_exam.question_overrides or {}) if attempt.mock_exam_id else {}
        qmap = {str(q.id): _apply_override(q, overrides.get(str(q.id))) for q in questions}

        totals, topic_stats, diff_stats = _score_answers(qmap, answers, attempt.choice_order or {})

        attempt.answers = answers
        attempt.score_verbal = totals["verbal"]["correct"]
        attempt.score_math = totals["math"]["correct"]
        attempt.total_score = totals["verbal"]["correct"] + totals["math"]["correct"]
        attempt.analytics = {
            "topic_accuracy": topic_stats,
            "difficulty_accuracy": diff_stats,
        }
        attempt.status = "submitted"
        attempt.submitted_at = timezone.now()
        attempt.save()

        if attempt.mock_exam.results_published or _is_staff(request.user):
            return Response(
                {
                    "ok": True,
                    "results_released": True,
                    "score_verbal": attempt.score_verbal,
                    "score_math": attempt.score_math,
                    "total_score": attempt.total_score,
                    "analytics": attempt.analytics,
                }
            )
        return Response({"ok": True, "results_released": False})
