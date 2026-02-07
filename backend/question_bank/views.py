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
from .models import Question
from .serializers import QuestionSerializer


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
