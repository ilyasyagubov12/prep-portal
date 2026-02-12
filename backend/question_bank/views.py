from collections import defaultdict
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
import os
import csv
import io
from accounts.views import _require_admin
from .models import Question, SubtopicProgress, TopicProgress
from .serializers import QuestionSerializer
from .topic_map import subtopic_order, topic_order


User = get_user_model()


def is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return user.is_superuser or getattr(prof, "is_admin", False) or role in ("admin", "teacher")


class QuestionsListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        subject = request.query_params.get("subject")
        topic = request.query_params.get("topic")
        subtopic = request.query_params.get("subtopic")

        qs = Question.objects.all()
        if subject:
            qs = qs.filter(subject=subject)
        if topic:
            qs = qs.filter(topic=topic)
        if subtopic:
            qs = qs.filter(subtopic=subtopic)

        # Students see only published
        if not is_staff(request.user):
            qs = qs.filter(published=True)

        limit_raw = request.query_params.get("limit")
        qs = qs.order_by("-created_at")
        if limit_raw:
            try:
                limit = int(limit_raw)
                if limit > 0:
                    qs = qs[:limit]
            except ValueError:
                pass
        data = QuestionSerializer(qs, many=True).data
        return Response({"ok": True, "questions": data})

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        serializer = QuestionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=400)
        q = serializer.save(created_by=request.user)
        return Response({"ok": True, "question": QuestionSerializer(q).data})


class QuestionImageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=400)

        ext = os.path.splitext(file.name)[1] or ".jpg"
        fname = f"question_images/{request.user.id}/{timezone.now().strftime('%Y%m%d%H%M%S')}{ext}"
        saved_path = default_storage.save(fname, ContentFile(file.read()))
        url = default_storage.url(saved_path) if hasattr(default_storage, "url") else saved_path
        absolute = request.build_absolute_uri(url)
        return Response({"ok": True, "url": absolute, "path": saved_path})


class QuestionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        try:
            return Question.objects.get(id=pk)
        except Question.DoesNotExist:
            return None

    def get(self, request, pk):
        q = self.get_object(pk)
        if not q:
            return Response({"error": "Not found"}, status=404)
        if not q.published and not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        return Response({"ok": True, "question": QuestionSerializer(q).data})

    def patch(self, request, pk):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        q = self.get_object(pk)
        if not q:
            return Response({"error": "Not found"}, status=404)
        serializer = QuestionSerializer(q, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=400)
        serializer.save()
        return Response({"ok": True, "question": serializer.data})

    def delete(self, request, pk):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)
        q = self.get_object(pk)
        if not q:
            return Response({"error": "Not found"}, status=404)
        q.delete()
        return Response({"ok": True})


class QuestionCountsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Question.objects.all()
        if not is_staff(request.user):
            qs = qs.filter(published=True)

        data = (
            qs.values("subject", "topic", "subtopic")
            .annotate(count=Count("id"))
            .order_by()
        )
        return Response({"ok": True, "counts": list(data)})


class QuestionImportView(APIView):
    """
    CSV import endpoint for admin/teacher.
    Columns expected:
    subject, topic, subtopic, stem, passage, difficulty, published, choice_a, choice_b, choice_c, choice_d, correct
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=403)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=400)

        raw = file.read()

        # Reject Excel uploads early so the frontend gets a clean JSON error
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
            return Response(
                {"error": "Could not decode file. Please upload UTF-8 CSV."},
                status=400,
            )
        reader = csv.DictReader(io.StringIO(decoded))
        created = 0
        errors = []

        for idx, row in enumerate(reader, start=1):
            try:
                subject = (row.get("subject") or "").strip().lower()
                topic = (row.get("topic") or "").strip()
                subtopic = (row.get("subtopic") or "").strip() or None
                stem = (row.get("stem") or "").strip()
                passage = (row.get("passage") or "").strip() or None
                difficulty = (row.get("difficulty") or "").strip() or None
                published = str(row.get("published") or "").lower() in ("1", "true", "yes")
                correct_letter = (row.get("correct") or "").strip().upper()
                choices = []
                for letter in ["A", "B", "C", "D", "E", "F"]:
                  col = f"choice_{letter.lower()}"
                  if col in row and row[col]:
                    choices.append({
                      "label": letter,
                      "content": row[col],
                      "is_correct": letter == correct_letter
                    })

                if not subject or not topic or not stem or len(choices) < 2:
                    raise ValueError("Missing required fields")
                if not any(c["is_correct"] for c in choices):
                    raise ValueError("No correct choice")

                Question.objects.create(
                    subject=subject,
                    topic=topic,
                    subtopic=subtopic,
                    stem=stem,
                    passage=passage,
                    difficulty=difficulty,
                    published=published,
                    choices=choices,
                    created_by=request.user,
                )
                created += 1
            except Exception as e:
                errors.append(f"Row {idx}: {e}")

        return Response({"ok": True, "created": created, "errors": errors})


def _parse_level(raw) -> int:
    try:
        return int(str(raw).strip())
    except Exception:
        return 0


def _effective_level(user, subject: str) -> int:
    prof = getattr(user, "profile", None)
    if not prof:
        return 0
    base = _parse_level(prof.math_level if subject == "math" else prof.verbal_level)
    completed = SubtopicProgress.objects.filter(user=user, subject=subject, passed=True).count()
    return max(base, completed)


def _set_level(user, subject: str, level: int):
    prof = getattr(user, "profile", None)
    if not prof:
        return
    if subject == "math":
        prof.math_level = str(level)
        prof.save(update_fields=["math_level"])
    else:
        prof.verbal_level = str(level)
        prof.save(update_fields=["verbal_level"])


def _topic_unlocked(subject: str, topic: str, completed_topics: set[str], level: int) -> bool:
    topics = topic_order(subject)
    if topic not in topics:
        return True
    idx = topics.index(topic)
    if idx == 0:
        return True
    prev_topic = topics[idx - 1]
    if prev_topic in completed_topics:
        return True
    # If level already covers all subtopics in previous topic, unlock.
    order = subtopic_order(subject)
    prev_indices = [i for i, (t, _) in enumerate(order) if t == prev_topic]
    if not prev_indices:
        return True
    return level >= max(prev_indices) + 1


def _subtopic_unlocked(subject: str, topic: str, subtopic: str, level: int, completed_topics: set[str]) -> bool:
    if not _topic_unlocked(subject, topic, completed_topics, level):
        return False
    order = subtopic_order(subject)
    try:
        idx = order.index((topic, subtopic))
    except ValueError:
        return False
    return idx <= level


class QuestionProgressView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        subject = request.query_params.get("subject")
        sub_qs = SubtopicProgress.objects.filter(user=request.user)
        topic_qs = TopicProgress.objects.filter(user=request.user)
        if subject:
            sub_qs = sub_qs.filter(subject=subject)
            topic_qs = topic_qs.filter(subject=subject)

        subtopics = [
            {
                "subject": s.subject,
                "topic": s.topic,
                "subtopic": s.subtopic,
                "passed": s.passed,
                "best_score": s.best_score,
            }
            for s in sub_qs
        ]
        topics = [
            {"subject": t.subject, "topic": t.topic, "passed": t.passed, "best_score": t.best_score}
            for t in topic_qs
        ]
        return Response({"ok": True, "subtopics": subtopics, "topics": topics})


class QuestionQuizView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        subject = (request.query_params.get("subject") or "").lower()
        topic = request.query_params.get("topic")
        subtopic = request.query_params.get("subtopic")
        if not subject or not topic:
            return Response({"error": "subject and topic required"}, status=400)

        if not is_staff(request.user):
            completed_topics = set(
                TopicProgress.objects.filter(user=request.user, subject=subject, passed=True).values_list("topic", flat=True)
            )
            level = _effective_level(request.user, subject)
            if subtopic:
                if not _subtopic_unlocked(subject, topic, subtopic, level, completed_topics):
                    return Response({"error": "Locked"}, status=403)
            else:
                # topic quiz lock: require all subtopics completed and topic unlocked
                if not _topic_unlocked(subject, topic, completed_topics, level):
                    return Response({"error": "Locked"}, status=403)
                required = {(topic, s) for (t, s) in subtopic_order(subject) if t == topic}
                completed = set(
                    SubtopicProgress.objects.filter(user=request.user, subject=subject, passed=True, topic=topic)
                    .values_list("topic", "subtopic")
                )
                if required and not required.issubset(completed):
                    # allow if level already covers all subtopics in this topic
                    order = subtopic_order(subject)
                    indices = [i for i, (t, _) in enumerate(order) if t == topic]
                    if indices and level < max(indices) + 1:
                        return Response({"error": "Complete all subtopics first"}, status=403)

        qs = Question.objects.filter(subject=subject, topic=topic)
        if subtopic:
            qs = qs.filter(subtopic=subtopic)
        if not is_staff(request.user):
            qs = qs.filter(published=True)

        try:
            limit = int(request.query_params.get("limit") or (10 if subtopic else 15))
        except Exception:
            limit = 10 if subtopic else 15
        limit = max(1, min(limit, 50))
        qs = qs.order_by("?")[:limit]

        questions = []
        for q in qs:
            data = QuestionSerializer(q).data
            for c in data.get("choices") or []:
                c.pop("is_correct", None)
            data.pop("correct_answer", None)
            questions.append(data)

        return Response(
            {
                "ok": True,
                "quiz": {
                    "subject": subject,
                    "topic": topic,
                    "subtopic": subtopic,
                    "total": len(questions),
                },
                "questions": questions,
            }
        )


class QuestionQuizSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        subject = (request.data.get("subject") or "").lower()
        topic = request.data.get("topic")
        subtopic = request.data.get("subtopic")
        answers = request.data.get("answers") or []
        if not subject or not topic or not isinstance(answers, list):
            return Response({"error": "subject, topic, and answers required"}, status=400)

        ids = [a.get("question_id") for a in answers if a.get("question_id")]
        if not ids:
            return Response({"error": "No answers provided"}, status=400)

        qs = Question.objects.filter(id__in=ids, subject=subject, topic=topic)
        if subtopic:
            qs = qs.filter(subtopic=subtopic)

        by_id = {str(q.id): q for q in qs}
        total = 0
        correct = 0
        for a in answers:
            qid = a.get("question_id")
            if not qid or qid not in by_id:
                continue
            q = by_id[qid]
            total += 1
            if q.is_open_ended:
                expected = (q.correct_answer or "").strip().lower()
                actual = str(a.get("answer") or "").strip().lower()
                if expected and actual == expected:
                    correct += 1
            else:
                pick = (a.get("answer") or "").strip()
                correct_label = next((c.get("label") for c in q.choices if c.get("is_correct")), None)
                if pick and correct_label and pick == correct_label:
                    correct += 1

        score = (correct / total) if total else 0
        passed = score >= 0.8

        if passed:
            if subtopic:
                prog, _ = SubtopicProgress.objects.get_or_create(
                    user=request.user, subject=subject, topic=topic, subtopic=subtopic
                )
                prog.best_score = max(prog.best_score or 0, score)
                prog.passed = True
                prog.completed_at = timezone.now()
                prog.save()

                # update level based on completed subtopics
                completed = SubtopicProgress.objects.filter(user=request.user, subject=subject, passed=True).count()
                current_level = _parse_level(
                    request.user.profile.math_level if subject == "math" else request.user.profile.verbal_level
                )
                _set_level(request.user, subject, max(current_level, completed))
            else:
                prog, _ = TopicProgress.objects.get_or_create(user=request.user, subject=subject, topic=topic)
                prog.best_score = max(prog.best_score or 0, score)
                prog.passed = True
                prog.completed_at = timezone.now()
                prog.save()

        return Response({"ok": True, "total": total, "correct": correct, "score": score, "passed": passed})
