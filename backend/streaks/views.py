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


def _parse_tz_offset(request):
    raw = (
        request.headers.get("X-TZ-Offset")
        or request.query_params.get("tz_offset")
        or request.data.get("tz_offset")
    )
    try:
        offset = int(raw)
    except Exception:
        return 0
    if offset > 840:
        return 840
    if offset < -840:
        return -840
    return offset


def _local_now(request):
    # JS getTimezoneOffset(): minutes to add to local time to get UTC.
    offset = _parse_tz_offset(request)
    return (timezone.now() - timedelta(minutes=offset)).replace(tzinfo=None)


def _local_date(request):
    return _local_now(request).date()


def _time_left_seconds(local_now):
    next_midnight = datetime.combine(local_now.date() + timedelta(days=1), datetime.min.time())
    return max(0, int((next_midnight - local_now).total_seconds()))


def _get_streak_count(user, today):
    base = get_streak_base(user, today=today)
    offset = getattr(getattr(user, "profile", None), "streak_offset", 0) or 0
    return max(0, base + offset)


class StreakStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        local_now = _local_now(request)
        today = local_now.date()
        progress = DailyStreakProgress.objects.filter(user=user, date=today).first()
        math_count = progress.math_count if progress else 0
        verbal_count = progress.verbal_count if progress else 0
        completed = bool(progress and progress.completed_at)
        time_left = _time_left_seconds(local_now)

        return Response(
            {
                "ok": True,
                "streak_count": _get_streak_count(user, today),
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
        selected_label = request.data.get("selected_label")
        is_correct = request.data.get("is_correct")

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

        local_now = _local_now(request)
        today = local_now.date()
        attempt, created = QuestionAttempt.objects.get_or_create(
            user=user,
            question=q,
            attempted_date=today,
            defaults={"subject": subject},
        )
        # Update attempt info for navigator/status
        if selected_label is not None:
            attempt.selected_label = str(selected_label)[:5]
        if is_correct is not None:
            attempt.is_correct = bool(is_correct)
        attempt.save()

        progress, _ = DailyStreakProgress.objects.get_or_create(user=user, date=today)

        if created:
            if subject == "math":
                progress.math_count = min(5, progress.math_count + 1)
            else:
                progress.verbal_count = min(5, progress.verbal_count + 1)

            if progress.math_count >= 5 and progress.verbal_count >= 5 and not progress.completed_at:
                progress.completed_at = timezone.now()
            progress.save()

        time_left = _time_left_seconds(local_now)

        return Response(
            {
                "ok": True,
                "streak_count": _get_streak_count(user, today),
                "today": {
                    "date": today.isoformat(),
                    "math_count": progress.math_count,
                    "verbal_count": progress.verbal_count,
                    "completed": bool(progress.completed_at),
                },
                "time_left_seconds": time_left,
            }
        )


class QuestionAttemptStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ids = request.data.get("question_ids") or []
        if not isinstance(ids, list) or not ids:
            return Response({"error": "question_ids required"}, status=status.HTTP_400_BAD_REQUEST)
        qs = QuestionAttempt.objects.filter(user=request.user, question_id__in=ids).order_by("-updated_at")
        status_map = {}
        for a in qs:
            qid = str(a.question_id)
            if qid in status_map:
                continue
            if a.is_correct is True:
                status_map[qid] = "correct"
            elif a.is_correct is False:
                status_map[qid] = "incorrect"
        return Response({"ok": True, "statuses": status_map})

# Create your views here.
