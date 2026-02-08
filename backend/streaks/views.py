from datetime import timedelta, datetime
from zoneinfo import ZoneInfo
from django.utils import timezone
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from question_bank.models import Question
from question_bank.views import is_staff
from .models import DailyStreakProgress, QuestionAttempt
from .utils import get_streak_base

BAKU_TZ = ZoneInfo("Asia/Baku")


def _local_now():
    return timezone.localtime(timezone.now(), BAKU_TZ)


def _local_date():
    return _local_now().date()


def _get_streak_count(user):
    base = get_streak_base(user)
    offset = getattr(getattr(user, "profile", None), "streak_offset", 0) or 0
    return max(0, base + offset)


class StreakStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = _local_date()
        progress = DailyStreakProgress.objects.filter(user=user, date=today).first()
        math_count = progress.math_count if progress else 0
        verbal_count = progress.verbal_count if progress else 0
        completed = bool(progress and progress.completed_at)

        now = _local_now()
        next_midnight = (today + timedelta(days=1))
        next_midnight_dt = timezone.make_aware(
            datetime.combine(next_midnight, datetime.min.time()),
            BAKU_TZ,
        )
        time_left = max(0, int((next_midnight_dt - now).total_seconds()))

        return Response(
            {
                "ok": True,
                "streak_count": _get_streak_count(user),
                "today": {
                    "date": today.isoformat(),
                    "math_count": math_count,
                    "verbal_count": verbal_count,
                    "completed": completed,
                },
                "time_left_seconds": time_left,
            }
        )


class StreakAttemptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        user = request.user
        question_id = request.data.get("question_id")
        subject = (request.data.get("subject") or "").lower()

        if not question_id:
            return Response({"error": "question_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            q = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)

        if not q.published and not is_staff(user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        subject = subject or q.subject
        if subject not in ["math", "verbal"]:
            subject = q.subject

        today = _local_date()
        attempt, created = QuestionAttempt.objects.get_or_create(
            user=user,
            question=q,
            attempted_date=today,
            defaults={"subject": subject},
        )

        progress, _ = DailyStreakProgress.objects.get_or_create(user=user, date=today)

        if created:
            if subject == "math":
                progress.math_count = min(5, progress.math_count + 1)
            else:
                progress.verbal_count = min(5, progress.verbal_count + 1)

            if progress.math_count >= 5 and progress.verbal_count >= 5 and not progress.completed_at:
                progress.completed_at = _local_now()
            progress.save()

        now = _local_now()
        next_midnight = (today + timedelta(days=1))
        next_midnight_dt = timezone.make_aware(
            datetime.combine(next_midnight, datetime.min.time()),
            BAKU_TZ,
        )
        time_left = max(0, int((next_midnight_dt - now).total_seconds()))

        return Response(
            {
                "ok": True,
                "streak_count": _get_streak_count(user),
                "today": {
                    "date": today.isoformat(),
                    "math_count": progress.math_count,
                    "verbal_count": progress.verbal_count,
                    "completed": bool(progress.completed_at),
                },
                "time_left_seconds": time_left,
            }
        )

# Create your views here.
