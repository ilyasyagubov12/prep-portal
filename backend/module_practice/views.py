from django.utils import timezone
from django.http import HttpResponse
from django.db import transaction, models
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
import csv
import io
import random

from accounts.models import User, Profile
from courses.models import Enrollment, Course
from .models import (
    ModulePractice,
    ModulePracticeModule,
    ModulePracticeAccess,
    ModulePracticeAttempt,
    ModulePracticeQuestion,
)


def _is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    is_admin = getattr(prof, "is_admin", False)
    return user.is_superuser or is_admin or role in ("admin", "teacher")


def _has_course_access(practice: ModulePractice, user: User) -> bool:
    if not practice.allowed_courses.exists():
        return False
    course_ids = practice.allowed_courses.values_list("id", flat=True)
    return Enrollment.objects.filter(course_id__in=course_ids, user=user).exists()


def _practice_accessible_student_ids(practice: ModulePractice):
    direct_ids = set(
        ModulePracticeAccess.objects.filter(practice=practice, is_active=True).values_list("student_id", flat=True)
    )
    course_ids = list(practice.allowed_courses.values_list("id", flat=True))
    if course_ids:
        direct_ids.update(Enrollment.objects.filter(course_id__in=course_ids).values_list("user_id", flat=True))
    return direct_ids


def _practice_result_visible_student_ids(practice: ModulePractice):
    return set(practice.result_visible_students.values_list("id", flat=True))


def _practice_results_visible_to_user(practice: ModulePractice, user: User) -> bool:
    if _is_staff(user):
        return True

    mode = (practice.result_visibility_mode or "").lower()
    if not mode:
        mode = "all" if practice.results_published else "hidden"

    if mode == "all":
        return True
    if mode == "selected":
        return practice.result_visible_students.filter(id=user.id).exists()
    return False


def _next_practice_sort_order():
    return (ModulePractice.objects.aggregate(max_order=models.Max("sort_order")).get("max_order") or -1) + 1


def _resequence_practices(practices: list[ModulePractice]):
    changed = []
    for index, practice in enumerate(practices):
        if practice.sort_order != index:
            practice.sort_order = index
            changed.append(practice)
    if changed:
        ModulePractice.objects.bulk_update(changed, ["sort_order"])


def _serialize_question_for_student(q: ModulePracticeQuestion, choice_order: list | None = None):
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
                        "image_url": c.get("image_url"),
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
                        "image_url": c.get("image_url"),
                    }
                )
        else:
            by_label = {c.get("label"): c for c in raw_choices if c.get("label")}
            used = set()
            for idx, label in enumerate(choice_order):
                c = by_label.get(label)
                if not c:
                    continue
                fallback = chr(65 + idx)
                choices.append(
                    {
                        "label": c.get("label") or fallback,
                        "content": c.get("content"),
                        "image_url": c.get("image_url"),
                    }
                )
                used.add(label)
            for idx, c in enumerate(raw_choices):
                label = c.get("label") or chr(65 + len(choices))
                if c.get("label") and c.get("label") in used:
                    continue
                choices.append(
                    {
                        "label": label,
                        "content": c.get("content"),
                        "image_url": c.get("image_url"),
                    }
                )
    else:
        for idx, c in enumerate(raw_choices):
            label = c.get("label") or chr(65 + idx)
            choices.append(
                {
                    "label": label,
                    "content": c.get("content"),
                    "image_url": c.get("image_url"),
                }
            )
    return {
        "id": str(q.id),
        "subject": q.subject,
        "module_index": q.module_index,
        "topic": q.topic_tag,
        "subtopic": None,
        "stem": q.question_text,
        "passage": q.passage,
        "choices": choices,
        "is_open_ended": q.is_open_ended,
        "image_url": q.image_url,
        "explanation": q.explanation,
    }


def _serialize_question_for_review(q: ModulePracticeQuestion, choice_order: list | None = None):
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
                        "image_url": c.get("image_url"),
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
                        "image_url": c.get("image_url"),
                    }
                )
        else:
            by_label = {c.get("label"): c for c in raw_choices if c.get("label")}
            used = set()
            for idx, label in enumerate(choice_order):
                c = by_label.get(label)
                if not c:
                    continue
                fallback = chr(65 + idx)
                choices.append(
                    {
                        "label": c.get("label") or fallback,
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                        "image_url": c.get("image_url"),
                    }
                )
                used.add(label)
            for c in raw_choices:
                label = c.get("label")
                if label and label in used:
                    continue
                choices.append(
                    {
                        "label": label or chr(65 + len(choices)),
                        "content": c.get("content"),
                        "is_correct": bool(c.get("is_correct")),
                        "image_url": c.get("image_url"),
                    }
                )
    else:
        for idx, c in enumerate(raw_choices):
            choices.append(
                {
                    "label": c.get("label") or chr(65 + idx),
                    "content": c.get("content"),
                    "is_correct": bool(c.get("is_correct")),
                    "image_url": c.get("image_url"),
                }
            )
    return {
        "id": str(q.id),
        "subject": q.subject,
        "module_index": q.module_index,
        "topic": q.topic_tag,
        "subtopic": None,
        "stem": q.question_text,
        "passage": q.passage,
        "choices": choices,
        "is_open_ended": q.is_open_ended,
        "correct_answer": q.correct_answer,
        "image_url": q.image_url,
        "explanation": q.explanation,
    }


def _serialize_question_for_staff(q: ModulePracticeQuestion):
    return {
        "id": str(q.id),
        "subject": q.subject,
        "module_index": q.module_index,
        "topic_tag": q.topic_tag,
        "difficulty": q.difficulty,
        "question_text": q.question_text,
        "passage": q.passage,
        "choices": q.choices or [],
        "is_open_ended": q.is_open_ended,
        "correct_answer": q.correct_answer,
        "explanation": q.explanation,
        "image_url": q.image_url,
        "order": q.order,
        "created_at": q.created_at,
        "updated_at": q.updated_at,
    }


def _score_answers(question_map: dict, answers: dict, choice_order: dict | None = None) -> tuple[int, int]:
    total = 0
    correct = 0
    order_map = choice_order or {}
    for qid, q in question_map.items():
        if qid not in answers:
            continue
        total += 1
        if q.is_open_ended:
            expected = (q.correct_answer or "").strip().lower()
            actual = str(answers.get(qid) or "").strip().lower()
            if expected and actual == expected:
                correct += 1
        else:
            pick = str(answers.get(qid) or "").strip()
            raw_choices = q.choices or []
            order = order_map.get(str(qid)) or order_map.get(qid) or []
            if order and all(isinstance(i, int) for i in order):
                idx = ord(pick.upper()) - 65 if pick else -1
                if 0 <= idx < len(order):
                    raw_idx = order[idx]
                    if 0 <= raw_idx < len(raw_choices) and raw_choices[raw_idx].get("is_correct"):
                        correct += 1
            else:
                correct_label = next(
                    (c.get("label") for c in raw_choices if c.get("is_correct")), None
                )
                if pick and correct_label and pick == correct_label:
                    correct += 1
    return correct, total


def _default_required_count(subject: str) -> int:
    return 22 if subject == "math" else 27


def _required_count_for_module(module: ModulePracticeModule) -> int:
    return module.required_count or _default_required_count(module.subject)


class ModulePracticeListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        staff = _is_staff(user)
        now = timezone.now()
        practices = ModulePractice.objects.order_by("sort_order", "-created_at")

        data = []
        for p in practices:
            modules = ModulePracticeModule.objects.filter(practice=p).order_by(
                models.Case(
                    models.When(subject="verbal", then=0),
                    models.When(subject="math", then=1),
                    default=2,
                    output_field=models.IntegerField(),
                ),
                "module_index",
            )
            access_qs = ModulePracticeAccess.objects.filter(practice=p, is_active=True)
            access = access_qs.filter(student=user).first()
            course_access = _has_course_access(p, user)
            locked = not staff
            expires_at = None
            if staff:
                locked = False
            else:
                if not p.is_active:
                    locked = True
                elif not access and not course_access:
                    locked = True
                else:
                    if access:
                        expires_at = access.expires_at
                        if access.expires_at and access.expires_at < now:
                            locked = True
                        else:
                            locked = False
                    else:
                        locked = False

            student_attempts = ModulePracticeAttempt.objects.filter(practice=p, student=user)
            attempts_count = student_attempts.count()
            latest_attempt = student_attempts.order_by("-started_at").first()
            can_view_results = _practice_results_visible_to_user(p, user)
            attempt_summary = None
            if latest_attempt and can_view_results:
                attempt_summary = {
                    "id": str(latest_attempt.id),
                    "status": latest_attempt.status,
                    "module_scores": latest_attempt.module_scores,
                    "completed_at": latest_attempt.completed_at,
                }

            data.append(
                {
                    "id": str(p.id),
                    "title": p.title,
                    "description": p.description,
                    "sort_order": p.sort_order,
                    "is_active": p.is_active,
                    "results_published": p.results_published,
                    "result_visibility_mode": p.result_visibility_mode,
                    "can_view_results": can_view_results,
                    "shuffle_questions": p.shuffle_questions,
                    "shuffle_choices": p.shuffle_choices,
                    "allow_retakes": p.allow_retakes,
                    "retake_limit": p.retake_limit,
                    "created_at": p.created_at,
                    "locked": locked,
                    "access_expires_at": expires_at,
                    "modules": [
                        {
                            "id": str(m.id),
                            "subject": m.subject,
                            "module_index": m.module_index,
                            "time_limit_minutes": m.time_limit_minutes,
                            "required_count": _required_count_for_module(m),
                            "question_count": ModulePracticeQuestion.objects.filter(module=m).count(),
                        }
                        for m in modules
                      ],
                      "attempts_count": attempts_count,
                      "attempt": attempt_summary,
                    "allowed_student_ids": list(access_qs.values_list("student_id", flat=True)) if staff else None,
                    "allowed_student_count": access_qs.count() if staff else None,
                    "allowed_course_ids": list(p.allowed_courses.values_list("id", flat=True)) if staff else None,
                    "allowed_course_count": p.allowed_courses.count() if staff else None,
                    "result_visible_student_ids": list(p.result_visible_students.values_list("id", flat=True))
                    if staff
                    else None,
                }
            )

        return Response({"ok": True, "practices": data})


class ModulePracticeCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        title = (request.data.get("title") or "").strip()
        description = request.data.get("description") or None
        if not title:
            return Response({"error": "title required"}, status=400)

        practice = ModulePractice.objects.create(
            title=title,
            description=description,
            created_by=request.user,
            sort_order=_next_practice_sort_order(),
        )

        defaults = [
            ("verbal", 1, 27, 32),
            ("verbal", 2, 27, 32),
            ("math", 1, 22, 35),
            ("math", 2, 22, 35),
        ]

        for subject, idx, qcount, mins in defaults:
            ModulePracticeModule.objects.create(
                practice=practice,
                subject=subject,
                module_index=idx,
                question_count=0,
                required_count=qcount,
                time_limit_minutes=mins,
                question_ids=[],
            )

        return Response({"ok": True, "practice_id": str(practice.id)})


class ModulePracticeUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        title = request.data.get("title")
        description = request.data.get("description")
        if title is not None:
            next_title = str(title).strip()
            if not next_title:
                return Response({"error": "title required"}, status=400)
            practice.title = next_title
        if description is not None:
            practice.description = description
        if "results_published" in request.data:
            next_published = bool(request.data.get("results_published"))
            practice.results_published = next_published
            if "result_visibility_mode" not in request.data:
                practice.result_visibility_mode = "all" if next_published else "hidden"
        if "result_visibility_mode" in request.data:
            mode = str(request.data.get("result_visibility_mode") or "hidden").strip().lower()
            if mode not in {"hidden", "all", "selected"}:
                return Response({"error": "Invalid result_visibility_mode"}, status=400)
            practice.result_visibility_mode = mode
            practice.results_published = mode != "hidden"
        if "is_active" in request.data:
            practice.is_active = bool(request.data.get("is_active"))
        if "shuffle_questions" in request.data:
            practice.shuffle_questions = bool(request.data.get("shuffle_questions"))
        if "shuffle_choices" in request.data:
            practice.shuffle_choices = bool(request.data.get("shuffle_choices"))
        if "allow_retakes" in request.data:
            practice.allow_retakes = bool(request.data.get("allow_retakes"))
        if "retake_limit" in request.data:
            limit = request.data.get("retake_limit")
            if limit in (None, "", "null"):
                practice.retake_limit = None
            else:
                practice.retake_limit = int(limit)
        practice.save()

        return Response({"ok": True})


class ModulePracticeDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        practice.delete()
        return Response({"ok": True})


class ModulePracticeReorderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        direction = str(request.data.get("direction") or "").strip().lower()
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        if direction not in {"up", "down"}:
            return Response({"error": "direction must be up or down"}, status=400)

        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        practices = list(ModulePractice.objects.order_by("sort_order", "-created_at"))
        current_index = next((idx for idx, item in enumerate(practices) if item.id == practice.id), None)
        if current_index is None:
            return Response({"error": "Not found"}, status=404)

        target_index = current_index - 1 if direction == "up" else current_index + 1
        if target_index < 0 or target_index >= len(practices):
            _resequence_practices(practices)
            return Response({"ok": True, "moved": False})

        moving = practices.pop(current_index)
        practices.insert(target_index, moving)
        _resequence_practices(practices)
        return Response({"ok": True, "moved": True})


class ModulePracticeModuleSetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        subject = (request.data.get("subject") or "").lower()
        module_index = request.data.get("module_index")
        question_ids = request.data.get("question_ids") or []
        time_limit = request.data.get("time_limit_minutes")
        question_count = request.data.get("question_count")
        required_count = request.data.get("required_count")

        if not pid or subject not in ("math", "verbal") or not module_index:
            return Response({"error": "practice_id, subject, module_index required"}, status=400)
        try:
            module_index = int(module_index)
        except Exception:
            return Response({"error": "module_index must be int"}, status=400)

        if not isinstance(question_ids, list):
            return Response({"error": "question_ids must be a list"}, status=400)

        if required_count is None:
            required_count = question_count

        try:
            required = int(required_count) if required_count is not None else None
        except Exception:
            return Response({"error": "required_count must be int"}, status=400)

        if required is not None and required <= 0:
            return Response({"error": "required_count must be greater than 0"}, status=400)

        if question_ids and required is not None and len(question_ids) != required:
            return Response(
                {"error": f"{subject.title()} modules require exactly {required} questions"},
                status=400,
            )

        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        module, _ = ModulePracticeModule.objects.get_or_create(
            practice=practice,
            subject=subject,
            module_index=module_index,
            defaults={
                "question_ids": [],
                "question_count": 0,
                "required_count": _default_required_count(subject),
                "time_limit_minutes": 30,
            },
        )

        module.question_ids = question_ids
        if time_limit is not None:
            module.time_limit_minutes = int(time_limit)
        if required is not None:
            module.required_count = required
        module.save()

        return Response({"ok": True})


class ModulePracticeQuestionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.query_params.get("practice_id")
        subject = (request.query_params.get("subject") or "").lower()
        module_index = request.query_params.get("module_index")
        if not pid or subject not in ("math", "verbal") or not module_index:
            return Response({"error": "practice_id, subject, module_index required"}, status=400)
        try:
            module_index = int(module_index)
        except Exception:
            return Response({"error": "module_index must be int"}, status=400)

        module = ModulePracticeModule.objects.filter(
            practice_id=pid, subject=subject, module_index=module_index
        ).first()
        if not module:
            return Response({"error": "Module not found"}, status=404)

        questions = ModulePracticeQuestion.objects.filter(module=module).order_by("order", "created_at")
        return Response({"ok": True, "questions": [_serialize_question_for_staff(q) for q in questions]})


class ModulePracticeQuestionCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        subject = (request.data.get("subject") or "").lower()
        module_index = request.data.get("module_index")
        question_text = request.data.get("question_text")
        topic_tag = request.data.get("topic_tag")
        difficulty = request.data.get("difficulty")
        passage = request.data.get("passage")
        choices = request.data.get("choices") or []
        is_open_ended = bool(request.data.get("is_open_ended"))
        correct_answer = request.data.get("correct_answer")
        explanation = request.data.get("explanation")
        image_url = request.data.get("image_url")

        if not pid or subject not in ("math", "verbal") or not module_index:
            return Response({"error": "practice_id, subject, module_index required"}, status=400)
        if not question_text or not topic_tag:
            return Response({"error": "question_text and topic_tag required"}, status=400)
        try:
            module_index = int(module_index)
        except Exception:
            return Response({"error": "module_index must be int"}, status=400)

        module = ModulePracticeModule.objects.filter(
            practice_id=pid, subject=subject, module_index=module_index
        ).first()
        if not module:
            return Response({"error": "Module not found"}, status=404)

        if not isinstance(choices, list):
            return Response({"error": "choices must be a list"}, status=400)

        required = _required_count_for_module(module)
        current_count = ModulePracticeQuestion.objects.filter(module=module).count()
        if current_count >= required:
            return Response(
                {"error": f"{subject.title()} Module {module_index} already has {required} questions"},
                status=400,
            )

        next_order = (
            ModulePracticeQuestion.objects.filter(module=module).aggregate(models.Max("order")).get("order__max") or 0
        ) + 1

        q = ModulePracticeQuestion.objects.create(
            practice_id=pid,
            module=module,
            subject=subject,
            module_index=module_index,
            topic_tag=topic_tag,
            question_text=question_text,
            passage=passage or None,
            choices=choices,
            is_open_ended=is_open_ended,
            correct_answer=correct_answer,
            explanation=explanation,
            image_url=image_url,
            difficulty=difficulty,
            order=next_order,
        )

        module.question_count = ModulePracticeQuestion.objects.filter(module=module).count()
        module.save(update_fields=["question_count"])

        return Response({"ok": True, "question_id": str(q.id)})


class ModulePracticeQuestionUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        qid = request.data.get("question_id")
        if not qid:
            return Response({"error": "question_id required"}, status=400)
        try:
            q = ModulePracticeQuestion.objects.get(id=qid)
        except ModulePracticeQuestion.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        fields = [
            "topic_tag",
            "difficulty",
            "question_text",
            "passage",
            "choices",
            "is_open_ended",
            "correct_answer",
            "explanation",
            "image_url",
        ]
        for f in fields:
            if f in request.data:
                setattr(q, f, request.data.get(f))
        q.save()

        return Response({"ok": True})


class ModulePracticeQuestionDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        qid = request.data.get("question_id")
        if not qid:
            return Response({"error": "question_id required"}, status=400)
        try:
            q = ModulePracticeQuestion.objects.get(id=qid)
        except ModulePracticeQuestion.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        module = q.module
        q.delete()

        remaining = list(ModulePracticeQuestion.objects.filter(module=module).order_by("order", "created_at"))
        for idx, item in enumerate(remaining, start=1):
            if item.order != idx:
                item.order = idx
                item.save(update_fields=["order"])
        module.question_count = len(remaining)
        module.save(update_fields=["question_count"])

        return Response({"ok": True})


class ModulePracticeQuestionImportView(APIView):
    """
    CSV import endpoint for module practice questions.
    Expected columns:
    subject, module, chapter, stem, passage (optional),
    choice_a, choice_b, choice_c, choice_d, correct
    Optional extra columns: difficulty, explanation, image_url, published
    """

    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=400)

        pid = request.data.get("practice_id")
        req_subject = (request.data.get("subject") or "").lower()
        req_module_index = request.data.get("module_index")

        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        if req_subject and req_subject not in ("math", "verbal"):
            return Response({"error": "subject must be math or verbal"}, status=400)
        if req_module_index:
            try:
                req_module_index = int(req_module_index)
            except Exception:
                return Response({"error": "module_index must be int"}, status=400)

        raw = file.read()
        if raw[:2] == b"PK":
            return Response(
                {
                    "error": "It looks like you uploaded an Excel (.xlsx) file. "
                             "Please export or save it as CSV (UTF-8) and try again."
                },
                status=400,
            )

        decoded = None
        for enc in ("utf-8-sig", "utf-8", "iso-8859-1"):
            try:
                decoded = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if decoded is None:
            return Response({"error": "Could not decode file. Please upload UTF-8 CSV."}, status=400)

        module_state: dict = {}

        reader = csv.DictReader(io.StringIO(decoded))
        created = 0
        errors = []

        for idx, row in enumerate(reader, start=1):
            try:
                row_subject = (row.get("subject") or "").strip().lower()
                row_module = row.get("module") or row.get("module_index")

                subject = row_subject or req_subject
                if subject not in ("math", "verbal"):
                    raise ValueError("Invalid or missing subject")
                if row_subject and req_subject and row_subject != req_subject:
                    raise ValueError("Subject does not match selected module")

                if row_module is None or row_module == "":
                    if req_module_index is None:
                        raise ValueError("Missing module")
                    module_index = req_module_index
                else:
                    try:
                        module_index = int(str(row_module).strip())
                    except Exception:
                        raise ValueError("Module must be an integer")

                if req_module_index and module_index != req_module_index:
                    raise ValueError("Module does not match selected module")

                module = ModulePracticeModule.objects.filter(
                    practice_id=pid, subject=subject, module_index=module_index
                ).first()
                if not module:
                    raise ValueError("Module not found")

                required = _required_count_for_module(module)
                state = module_state.get(module.id)
                if not state:
                    qs = ModulePracticeQuestion.objects.filter(module=module)
                    state = {
                        "count": qs.count(),
                        "next_order": (qs.aggregate(models.Max("order")).get("order__max") or 0) + 1,
                    }
                    module_state[module.id] = state
                if state["count"] >= required:
                    raise ValueError(f"Module already full ({required} questions)")

                chapter = (row.get("chapter") or row.get("topic_tag") or row.get("topic") or "").strip()
                question_text = (row.get("stem") or row.get("question_text") or "").strip()
                passage = (row.get("passage") or "").strip() or None
                difficulty = (row.get("difficulty") or "").strip() or None
                correct_answer = (row.get("correct_answer") or "").strip() or None
                explanation = (row.get("explanation") or "").strip() or None
                image_url = (row.get("image_url") or "").strip() or None
                correct_letter = (row.get("answer") or row.get("correct") or "").strip().upper()

                choices = []
                choice_map = {
                    "A": row.get("A") or row.get("choice_a"),
                    "B": row.get("B") or row.get("choice_b"),
                    "C": row.get("C") or row.get("choice_c"),
                    "D": row.get("D") or row.get("choice_d"),
                }
                for letter in ["A", "B", "C", "D"]:
                    val = choice_map.get(letter)
                    if val:
                        choices.append(
                            {"label": letter, "content": val, "is_correct": letter == correct_letter}
                        )

                if not question_text:
                    raise ValueError("Missing stem")

                is_open_ended = False
                if len(choices) == 0:
                    is_open_ended = True

                if is_open_ended:
                    if not correct_answer:
                        correct_answer = (row.get("correct") or row.get("answer") or "").strip() or None
                else:
                    if len(choices) < 2:
                        raise ValueError("At least two choices required")
                    if correct_letter not in ("A", "B", "C", "D"):
                        raise ValueError("Answer must be A, B, C, or D")
                    if not any(c.get("is_correct") for c in choices):
                        raise ValueError("No correct choice specified")

                topic_tag = chapter or "General"
                next_order = state["next_order"]

                ModulePracticeQuestion.objects.create(
                    practice_id=pid,
                    module=module,
                    subject=subject,
                    module_index=module_index,
                    topic_tag=topic_tag,
                    question_text=question_text,
                    passage=passage,
                    choices=[] if is_open_ended else choices,
                    is_open_ended=is_open_ended,
                    correct_answer=correct_answer if is_open_ended else None,
                    explanation=explanation,
                    image_url=image_url,
                    difficulty=difficulty,
                    order=next_order,
                )
                created += 1
                state["count"] += 1
                state["next_order"] += 1
            except Exception as e:
                errors.append(f"Row {idx}: {e}")

        for module_id, state in module_state.items():
            ModulePracticeModule.objects.filter(id=module_id).update(question_count=state["count"])

        return Response({"ok": True, "created": created, "errors": errors})


class ModulePracticeQuestionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, question_id):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            q = ModulePracticeQuestion.objects.get(id=question_id)
        except ModulePracticeQuestion.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        return Response({"ok": True, "question": _serialize_question_for_staff(q)})


class ModulePracticeExportView(APIView):
    """
    CSV export endpoint for module practice questions.
    Exports all questions for a practice (optionally filtered by subject/module).
    Columns:
    subject, module, chapter, stem, passage, choice_a, choice_b, choice_c, choice_d, correct
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        pid = request.query_params.get("practice_id")
        subject = (request.query_params.get("subject") or "").lower()
        module_index = request.query_params.get("module_index")

        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        if subject and subject not in ("math", "verbal"):
            return Response({"error": "subject must be math or verbal"}, status=400)
        if module_index:
            try:
                module_index = int(module_index)
            except Exception:
                return Response({"error": "module_index must be int"}, status=400)

        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        modules = ModulePracticeModule.objects.filter(practice=practice)
        if subject:
            modules = modules.filter(subject=subject)
        if module_index:
            modules = modules.filter(module_index=module_index)

        modules = modules.order_by(
            models.Case(
                models.When(subject="verbal", then=0),
                models.When(subject="math", then=1),
                default=2,
                output_field=models.IntegerField(),
            ),
            "module_index",
        )

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "subject",
                "module",
                "chapter",
                "stem",
                "passage",
                "choice_a",
                "choice_b",
                "choice_c",
                "choice_d",
                "correct",
            ]
        )

        for m in modules:
            questions = ModulePracticeQuestion.objects.filter(module=m).order_by("order", "created_at")
            for q in questions:
                choices = q.choices or []
                choice_map = {}
                for idx, c in enumerate(choices):
                    label = (c.get("label") or chr(65 + idx)).upper()
                    if label in ("A", "B", "C", "D") and label not in choice_map:
                        choice_map[label] = c.get("content") or ""

                choice_a = choice_map.get("A", "")
                choice_b = choice_map.get("B", "")
                choice_c = choice_map.get("C", "")
                choice_d = choice_map.get("D", "")

                if q.is_open_ended:
                    correct = q.correct_answer or ""
                else:
                    correct_label = None
                    for idx, c in enumerate(choices):
                        if c.get("is_correct"):
                            correct_label = (c.get("label") or chr(65 + idx)).upper()
                            break
                    correct = correct_label or ""

                writer.writerow(
                    [
                        q.subject or m.subject,
                        q.module_index or m.module_index,
                        q.topic_tag or "",
                        q.question_text or "",
                        q.passage or "",
                        choice_a,
                        choice_b,
                        choice_c,
                        choice_d,
                        correct,
                    ]
                )

        filename = f"practice_{practice.id}.csv"
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ModulePracticeAccessGrantView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        user_id = request.data.get("user_id")
        email = request.data.get("email")
        username = request.data.get("username")
        expires_at = request.data.get("expires_at")

        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        student = None
        if user_id:
            student = User.objects.filter(id=user_id).first()
        if not student and email:
            student = User.objects.filter(email=email).first()
        if not student and username:
            student = User.objects.filter(username=username).first()
        if not student:
            return Response({"error": "Student not found"}, status=404)

        exp_dt = None
        if expires_at:
            try:
                exp_dt = timezone.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except Exception:
                exp_dt = None

        access, _ = ModulePracticeAccess.objects.get_or_create(practice=practice, student=student)
        access.granted_by = request.user
        access.is_active = True
        access.expires_at = exp_dt
        access.save()

        return Response({"ok": True})


class ModulePracticeAccessRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        pid = request.data.get("practice_id")
        user_id = request.data.get("user_id")
        if not pid or not user_id:
            return Response({"error": "practice_id and user_id required"}, status=400)

        ModulePracticeAccess.objects.filter(practice_id=pid, student_id=user_id).update(is_active=False)
        return Response({"ok": True})


class ModulePracticeStudentSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        q = (request.data.get("q") or "").strip().lower()
        tag = (request.data.get("tag") or "").strip()
        course_id = (request.data.get("course_id") or "").strip()
        limit = int(request.data.get("limit") or 50)
        practice_id = request.data.get("practice_id")
        accessible_only = bool(request.data.get("accessible_only"))
        attempt_counts: dict[str, int] = {}
        access_limits: dict[str, int | None] = {}
        result_visible_ids: set[str] = set()
        student_course_map: dict[str, list[dict[str, str]]] = {}
        if practice_id:
            rows = (
                ModulePracticeAttempt.objects.filter(practice_id=practice_id, status="submitted")
                .values("student_id")
                .annotate(count=models.Count("id"))
            )
            attempt_counts = {str(r["student_id"]): r["count"] for r in rows}
            access_rows = ModulePracticeAccess.objects.filter(practice_id=practice_id, is_active=True).values(
                "student_id", "attempt_limit"
            )
            access_limits = {str(r["student_id"]): r["attempt_limit"] for r in access_rows}
            practice = ModulePractice.objects.filter(id=practice_id).first()
            if practice:
                result_visible_ids = {str(student_id) for student_id in _practice_result_visible_student_ids(practice)}

        qs = Profile.objects.select_related("user").filter(role="student")
        if practice_id and accessible_only:
            practice = ModulePractice.objects.filter(id=practice_id).first()
            if practice:
                accessible_ids = _practice_accessible_student_ids(practice)
                if accessible_ids:
                    qs = qs.filter(user_id__in=accessible_ids)
                else:
                    qs = qs.none()
        if course_id:
            enrolled_ids = Enrollment.objects.filter(course_id=course_id).values_list("user_id", flat=True)
            qs = qs.filter(user_id__in=enrolled_ids)
        if tag:
            qs = qs.filter(tag__iexact=tag)
        if q:
            qs = qs.filter(
                models.Q(nickname__icontains=q)
                | models.Q(user__username__icontains=q)
                | models.Q(user__first_name__icontains=q)
                | models.Q(user__last_name__icontains=q)
                | models.Q(student_id__icontains=q)
                | models.Q(user_id__icontains=q)
            )

        qs = qs.order_by("nickname", "user__username")[: max(1, min(limit, 200))]
        selected_user_ids = [p.user_id for p in qs]
        if selected_user_ids:
            enrollment_rows = (
                Enrollment.objects.filter(user_id__in=selected_user_ids)
                .select_related("course")
                .values("user_id", "course_id", "course__title")
            )
            for row in enrollment_rows:
                uid = str(row["user_id"])
                student_course_map.setdefault(uid, []).append(
                    {"id": str(row["course_id"]), "title": row["course__title"] or ""}
                )
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
                    "tag": p.tag,
                    "avatar": p.avatar,
                    "attempts_count": attempt_counts.get(str(p.user.id), 0),
                    "access_limit": access_limits.get(str(p.user.id)),
                    "can_view_results": str(p.user.id) in result_visible_ids,
                    "courses": student_course_map.get(str(p.user.id), []),
                }
            )
        return Response({"ok": True, "students": data})


class ModulePracticeStudentLookupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        student_ids = request.data.get("student_ids") or []
        practice_id = request.data.get("practice_id")
        if not isinstance(student_ids, list):
            return Response({"error": "student_ids must be list"}, status=400)

        attempt_counts: dict[str, int] = {}
        access_limits: dict[str, int | None] = {}
        result_visible_ids: set[str] = set()
        student_course_map: dict[str, list[dict[str, str]]] = {}
        if practice_id:
            practice = ModulePractice.objects.filter(id=practice_id).first()
            rows = (
                ModulePracticeAttempt.objects.filter(
                    practice_id=practice_id, status="submitted", student_id__in=student_ids
                )
                .values("student_id")
                .annotate(count=models.Count("id"))
            )
            attempt_counts = {str(r["student_id"]): r["count"] for r in rows}
            access_rows = ModulePracticeAccess.objects.filter(
                practice_id=practice_id, is_active=True, student_id__in=student_ids
            ).values("student_id", "attempt_limit")
            access_limits = {str(r["student_id"]): r["attempt_limit"] for r in access_rows}
            if practice:
                result_visible_ids = {str(student_id) for student_id in _practice_result_visible_student_ids(practice)}

        qs = Profile.objects.select_related("user").filter(user_id__in=student_ids)
        if student_ids:
            enrollment_rows = (
                Enrollment.objects.filter(user_id__in=student_ids)
                .select_related("course")
                .values("user_id", "course_id", "course__title")
            )
            for row in enrollment_rows:
                uid = str(row["user_id"])
                student_course_map.setdefault(uid, []).append(
                    {"id": str(row["course_id"]), "title": row["course__title"] or ""}
                )
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
                    "tag": p.tag,
                    "avatar": p.avatar,
                    "attempts_count": attempt_counts.get(str(p.user.id), 0),
                    "access_limit": access_limits.get(str(p.user.id)),
                    "can_view_results": str(p.user.id) in result_visible_ids,
                    "courses": student_course_map.get(str(p.user.id), []),
                }
            )
        return Response({"ok": True, "students": data})


class ModulePracticeAccessSetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        pid = request.data.get("practice_id")
        student_ids = request.data.get("student_ids") or []
        student_limits = request.data.get("student_limits") or {}
        course_ids = request.data.get("course_ids") or []
        if not pid:
            return Response({"error": "practice_id required"}, status=400)

        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not isinstance(student_ids, list):
            return Response({"error": "student_ids must be list"}, status=400)
        if not isinstance(course_ids, list):
            return Response({"error": "course_ids must be list"}, status=400)
        if not isinstance(student_limits, dict):
            return Response({"error": "student_limits must be dict"}, status=400)

        courses = Course.objects.filter(id__in=course_ids)
        practice.allowed_courses.set(courses)

        ModulePracticeAccess.objects.filter(practice=practice).delete()
        students = User.objects.filter(id__in=student_ids)

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
                ModulePracticeAccess(
                    practice=practice,
                    student=student,
                    granted_by=request.user,
                    is_active=True,
                    attempt_limit=parsed_limit,
                )
            )

        ModulePracticeAccess.objects.bulk_create(
            access_rows
        )
        return Response({"ok": True, "allowed_student_count": students.count()})


class ModulePracticeResultVisibilitySetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        pid = request.data.get("practice_id")
        mode = str(request.data.get("result_visibility_mode") or "hidden").strip().lower()
        student_ids = request.data.get("student_ids") or []
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        if mode not in {"hidden", "all", "selected"}:
            return Response({"error": "Invalid result_visibility_mode"}, status=400)
        if not isinstance(student_ids, list):
            return Response({"error": "student_ids must be list"}, status=400)

        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        students = User.objects.filter(id__in=student_ids)
        practice.result_visibility_mode = mode
        practice.results_published = mode != "hidden"
        practice.save(update_fields=["result_visibility_mode", "results_published", "updated_at"])
        practice.result_visible_students.set(students)

        return Response(
            {
                "ok": True,
                "result_visibility_mode": practice.result_visibility_mode,
                "visible_student_count": students.count(),
            }
        )


class ModulePracticeStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        pid = request.data.get("practice_id")
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        user = request.user
        staff = _is_staff(user)
        course_access = _has_course_access(practice, user)
        if not staff:
            if not practice.is_active:
                return Response({"error": "Locked"}, status=403)
            access = ModulePracticeAccess.objects.filter(practice=practice, student=user, is_active=True).first()
            if not access and not course_access:
                return Response({"error": "Locked"}, status=403)
            if access and access.expires_at and access.expires_at < timezone.now():
                return Response({"error": "Access expired"}, status=403)

        if not staff:
            if not practice.allow_retakes:
                submitted = ModulePracticeAttempt.objects.filter(
                    practice=practice, student=user, status="submitted"
                ).first()
                if submitted:
                    return Response({"error": "Retakes disabled"}, status=403)
            else:
                access_limit = access.attempt_limit if access else None
                effective_limit = access_limit if access_limit is not None else practice.retake_limit
                if effective_limit is not None:
                    submitted_count = ModulePracticeAttempt.objects.filter(
                        practice=practice, student=user, status="submitted"
                    ).count()
                    if submitted_count >= effective_limit:
                        return Response({"error": "Retake limit reached"}, status=403)

        attempt = (
            ModulePracticeAttempt.objects.filter(
                practice=practice,
                student=user,
                status="in_progress",
            )
            .order_by("-started_at")
            .first()
        )
        if not attempt:
            attempt = ModulePracticeAttempt.objects.create(
                practice=practice,
                student=user,
                status="in_progress",
            )

        modules = ModulePracticeModule.objects.filter(practice=practice).order_by(
            models.Case(
                models.When(subject="verbal", then=0),
                models.When(subject="math", then=1),
                default=2,
                output_field=models.IntegerField(),
            ),
            "module_index",
        )
        for m in modules:
            required = _required_count_for_module(m)
            count = ModulePracticeQuestion.objects.filter(module=m).count()
            if count != required:
                return Response(
                    {"error": f"{m.subject.title()} Module {m.module_index} requires {required} questions"},
                    status=400,
                )
        question_order = attempt.question_order or {}
        choice_order = attempt.choice_order or {}
        updated = False

        modules_payload = []
        for m in modules:
            questions = list(ModulePracticeQuestion.objects.filter(module=m).order_by("order", "created_at"))
            module_key = str(m.id)
            order = question_order.get(module_key)
            if not order:
                order = [str(q.id) for q in questions]
                if practice.shuffle_questions:
                    random.shuffle(order)
                question_order[module_key] = order
                updated = True

            qmap = {str(q.id): q for q in questions}
            payload_questions = []
            for qid in order:
                q = qmap.get(str(qid))
                if not q:
                    continue
                if practice.shuffle_choices:
                    if str(q.id) not in choice_order:
                        indices = list(range(len(q.choices or [])))
                        random.shuffle(indices)
                        choice_order[str(q.id)] = indices
                        updated = True
                    payload_questions.append(
                        _serialize_question_for_student(q, choice_order.get(str(q.id)))
                    )
                else:
                    payload_questions.append(_serialize_question_for_student(q))

            modules_payload.append(
                {
                    "id": str(m.id),
                    "subject": m.subject,
                    "module_index": m.module_index,
                    "time_limit_minutes": m.time_limit_minutes,
                    "questions": payload_questions,
                }
            )

        if updated:
            attempt.question_order = question_order
            attempt.choice_order = choice_order
            attempt.save(update_fields=["question_order", "choice_order"])

        return Response(
            {
                "ok": True,
                "attempt_id": str(attempt.id),
                "practice": {
                    "id": str(practice.id),
                    "title": practice.title,
                    "description": practice.description,
                },
                "modules": modules_payload,
            }
        )


class ModulePracticeReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pid = request.query_params.get("practice_id")
        attempt_id = request.query_params.get("attempt_id")
        user = request.user
        staff = _is_staff(user)
        attempt = None
        practice = None

        if attempt_id:
            attempt = (
                ModulePracticeAttempt.objects.select_related("practice")
                .filter(id=attempt_id, status="submitted")
                .first()
            )
            if not attempt:
                return Response({"error": "No submitted attempt"}, status=404)
            practice = attempt.practice
            if attempt.student_id != user.id and not staff:
                return Response({"error": "Forbidden"}, status=403)
        else:
            if not pid:
                return Response({"error": "practice_id required"}, status=400)
            try:
                practice = ModulePractice.objects.get(id=pid)
            except ModulePractice.DoesNotExist:
                return Response({"error": "Not found"}, status=404)
            attempt = (
                ModulePracticeAttempt.objects.filter(practice=practice, student=user, status="submitted")
                .order_by("-completed_at")
                .first()
            )

        if not practice:
            return Response({"error": "Not found"}, status=404)
        if not _practice_results_visible_to_user(practice, user):
            return Response({"error": "Results not published"}, status=403)
        if not attempt:
            return Response({"error": "No submitted attempt"}, status=404)

        modules = ModulePracticeModule.objects.filter(practice=practice).order_by(
            models.Case(
                models.When(subject="verbal", then=0),
                models.When(subject="math", then=1),
                default=2,
                output_field=models.IntegerField(),
            ),
            "module_index",
        )

        question_order = attempt.question_order or {}
        choice_order = attempt.choice_order or {}
        modules_payload = []
        for m in modules:
            order = question_order.get(str(m.id))
            if not order:
                order = list(
                    ModulePracticeQuestion.objects.filter(module=m)
                    .order_by("order", "created_at")
                    .values_list("id", flat=True)
                )
                order = [str(i) for i in order]

            questions = ModulePracticeQuestion.objects.filter(id__in=order)
            qmap = {str(q.id): q for q in questions}
            payload_questions = []
            for qid in order:
                q = qmap.get(str(qid))
                if not q:
                    continue
                payload_questions.append(
                    _serialize_question_for_review(q, choice_order.get(str(q.id)))
                )

            modules_payload.append(
                {
                    "id": str(m.id),
                    "subject": m.subject,
                    "module_index": m.module_index,
                    "time_limit_minutes": m.time_limit_minutes,
                    "questions": payload_questions,
                }
            )

        return Response(
            {
                "ok": True,
                "review": True,
                "attempt_id": str(attempt.id),
                "practice": {
                    "id": str(practice.id),
                    "title": practice.title,
                    "description": practice.description,
                },
                "modules": modules_payload,
                "answers": attempt.answers,
                "module_scores": attempt.module_scores,
                "completed_at": attempt.completed_at,
            }
        )


class ModulePracticeAttemptsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pid = request.query_params.get("practice_id")
        if not pid:
            return Response({"error": "practice_id required"}, status=400)
        try:
            practice = ModulePractice.objects.get(id=pid)
        except ModulePractice.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        user = request.user
        staff = _is_staff(user)
        student_id = request.query_params.get("student_id")
        if student_id:
            if not staff and str(student_id) != str(user.id):
                return Response({"error": "Forbidden"}, status=403)
            target_id = student_id
        else:
            target_id = user.id

        can_view_results = _practice_results_visible_to_user(practice, user)
        if not can_view_results and not staff:
            return Response({"error": "Results not published"}, status=403)

        attempts = (
            ModulePracticeAttempt.objects.filter(practice=practice, student_id=target_id, status="submitted")
            .order_by("-completed_at", "-started_at")
        )

        data = []
        for attempt in attempts:
            data.append(
                {
                    "id": str(attempt.id),
                    "completed_at": attempt.completed_at,
                    "module_scores": attempt.module_scores,
                    "correct": attempt.correct,
                    "total": attempt.total,
                }
            )

        return Response(
            {
                "ok": True,
                "results_published": practice.results_published,
                "result_visibility_mode": practice.result_visibility_mode,
                "can_view_results": can_view_results,
                "attempts": data,
            }
        )


class ModulePracticeSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        attempt_id = request.data.get("attempt_id")
        answers_payload = request.data.get("answers") or {}
        if not attempt_id:
            return Response({"error": "attempt_id required"}, status=400)

        try:
            attempt = ModulePracticeAttempt.objects.select_related("practice").get(id=attempt_id)
        except ModulePracticeAttempt.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if attempt.student_id != request.user.id and not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        if attempt.status == "submitted":
            return Response({"error": "Already submitted"}, status=400)

        answers = {}
        if isinstance(answers_payload, list):
            for item in answers_payload:
                qid = item.get("question_id")
                if qid:
                    answers[str(qid)] = item.get("answer")
        elif isinstance(answers_payload, dict):
            answers = {str(k): v for k, v in answers_payload.items()}
        else:
            return Response({"error": "answers must be list or dict"}, status=400)

        modules = ModulePracticeModule.objects.filter(practice=attempt.practice)
        module_scores = {}
        total_correct = 0
        total_count = 0

        for m in modules:
            questions = list(ModulePracticeQuestion.objects.filter(module=m))
            ids = [str(q.id) for q in questions]
            qmap = {str(q.id): q for q in questions}
            module_answers = {qid: answers.get(qid) for qid in ids if qid in answers}
            correct, count = _score_answers(qmap, module_answers, attempt.choice_order or {})
            total_correct += correct
            total_count += count
            key = f"{m.subject}-{m.module_index}"
            module_scores[key] = {
                "correct": correct,
                "total": count,
            }

        attempt.answers = answers
        attempt.module_scores = module_scores
        attempt.correct = total_correct
        attempt.total = total_count
        attempt.score = (total_correct / total_count) if total_count else 0
        attempt.status = "submitted"
        attempt.completed_at = timezone.now()
        attempt.save()

        if _practice_results_visible_to_user(attempt.practice, request.user):
            return Response(
                {
                    "ok": True,
                    "results_released": True,
                    "module_scores": attempt.module_scores,
                }
            )
        return Response({"ok": True, "results_released": False})
