from django.utils import timezone
from django.db import transaction
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from question_bank.models import Question
from question_bank.serializers import QuestionSerializer

from .models import (
    ModulePractice,
    ModulePracticeModule,
    ModulePracticeAccess,
    ModulePracticeAttempt,
)


def _is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    is_admin = getattr(prof, "is_admin", False)
    return user.is_superuser or is_admin or role in ("admin", "teacher")


def _serialize_question(q: Question):
    data = QuestionSerializer(q).data
    for c in data.get("choices") or []:
        c.pop("is_correct", None)
    data.pop("correct_answer", None)
    return data


def _score_answers(question_map: dict, answers: dict) -> tuple[int, int]:
    total = 0
    correct = 0
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
            correct_label = next((c.get("label") for c in q.choices if c.get("is_correct")), None)
            if pick and correct_label and pick == correct_label:
                correct += 1
    return correct, total


class ModulePracticeListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        staff = _is_staff(user)
        now = timezone.now()
        practices = ModulePractice.objects.order_by("-created_at")

        data = []
        for p in practices:
            modules = (
                ModulePracticeModule.objects.filter(practice=p)
                .order_by("subject", "module_index")
            )
            access = ModulePracticeAccess.objects.filter(practice=p, student=user, is_active=True).first()
            locked = not staff
            expires_at = None
            if staff:
                locked = False
            else:
                if not p.is_active:
                    locked = True
                elif not access:
                    locked = True
                else:
                    expires_at = access.expires_at
                    if access.expires_at and access.expires_at < now:
                        locked = True
                    else:
                        locked = False

            latest_attempt = (
                ModulePracticeAttempt.objects.filter(practice=p, student=user)
                .order_by("-started_at")
                .first()
            )
            attempt_summary = None
            if latest_attempt and (p.results_published or staff):
                attempt_summary = {
                    "id": str(latest_attempt.id),
                    "status": latest_attempt.status,
                    "score": latest_attempt.score,
                    "correct": latest_attempt.correct,
                    "total": latest_attempt.total,
                    "completed_at": latest_attempt.completed_at,
                }

            data.append(
                {
                    "id": str(p.id),
                    "title": p.title,
                    "description": p.description,
                    "is_active": p.is_active,
                    "results_published": p.results_published,
                    "created_at": p.created_at,
                    "locked": locked,
                    "access_expires_at": expires_at,
                    "modules": [
                        {
                            "id": str(m.id),
                            "subject": m.subject,
                            "module_index": m.module_index,
                            "time_limit_minutes": m.time_limit_minutes,
                            "question_count": m.question_count,
                            "question_ids": m.question_ids if staff else None,
                        }
                        for m in modules
                    ],
                    "attempt": attempt_summary,
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
                question_count=qcount,
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
            practice.title = str(title).strip()
        if description is not None:
            practice.description = description
        if "results_published" in request.data:
            practice.results_published = bool(request.data.get("results_published"))
        if "is_active" in request.data:
            practice.is_active = bool(request.data.get("is_active"))
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

        if not pid or subject not in ("math", "verbal") or not module_index:
            return Response({"error": "practice_id, subject, module_index required"}, status=400)
        try:
            module_index = int(module_index)
        except Exception:
            return Response({"error": "module_index must be int"}, status=400)

        if not isinstance(question_ids, list):
            return Response({"error": "question_ids must be a list"}, status=400)

        required = 22 if subject == "math" else 27
        if len(question_ids) != required:
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
            defaults={"question_ids": [], "question_count": 0, "time_limit_minutes": 30},
        )

        module.question_ids = question_ids
        if time_limit is not None:
            module.time_limit_minutes = int(time_limit)
        module.question_count = required
        module.save()

        return Response({"ok": True})


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
        if not staff:
            access = ModulePracticeAccess.objects.filter(practice=practice, student=user, is_active=True).first()
            if not access:
                return Response({"error": "Locked"}, status=403)
            if access.expires_at and access.expires_at < timezone.now():
                return Response({"error": "Access expired"}, status=403)
            if not practice.is_active:
                return Response({"error": "Locked"}, status=403)

        attempt = ModulePracticeAttempt.objects.create(
            practice=practice,
            student=user,
            status="in_progress",
        )

        modules = ModulePracticeModule.objects.filter(practice=practice).order_by("subject", "module_index")
        modules_payload = []
        for m in modules:
            ids = [str(x) for x in (m.question_ids or [])]
            questions = list(Question.objects.filter(id__in=ids))
            by_id = {str(q.id): q for q in questions}
            ordered = [by_id[qid] for qid in ids if qid in by_id]
            modules_payload.append(
                {
                    "id": str(m.id),
                    "subject": m.subject,
                    "module_index": m.module_index,
                    "time_limit_minutes": m.time_limit_minutes,
                    "questions": [_serialize_question(q) for q in ordered],
                }
            )

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
            ids = [str(x) for x in (m.question_ids or [])]
            questions = Question.objects.filter(id__in=ids)
            qmap = {str(q.id): q for q in questions}
            module_answers = {qid: answers.get(qid) for qid in ids if qid in answers}
            correct, count = _score_answers(qmap, module_answers)
            total_correct += correct
            total_count += count
            key = f"{m.subject}-{m.module_index}"
            module_scores[key] = {
                "correct": correct,
                "total": count,
                "score": (correct / count) if count else 0,
            }

        attempt.answers = answers
        attempt.module_scores = module_scores
        attempt.correct = total_correct
        attempt.total = total_count
        attempt.score = (total_correct / total_count) if total_count else 0
        attempt.status = "submitted"
        attempt.completed_at = timezone.now()
        attempt.save()

        if attempt.practice.results_published or _is_staff(request.user):
            return Response(
                {
                    "ok": True,
                    "results_released": True,
                    "correct": attempt.correct,
                    "total": attempt.total,
                    "score": attempt.score,
                    "module_scores": attempt.module_scores,
                }
            )
        return Response({"ok": True, "results_released": False})
