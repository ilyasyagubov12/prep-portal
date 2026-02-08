from datetime import timedelta
from django.utils import timezone
from .models import DailyStreakProgress


def get_streak_base(user):
    today = timezone.localdate()
    today_progress = DailyStreakProgress.objects.filter(user=user, date=today).first()
    completed_today = bool(today_progress and today_progress.completed_at)
    start_date = today if completed_today else today - timedelta(days=1)

    qs = DailyStreakProgress.objects.filter(user=user, completed_at__isnull=False).order_by("-date")

    expected = start_date
    count = 0
    for rec in qs:
        if rec.date > expected:
            continue
        if rec.date == expected:
            count += 1
            expected = expected - timedelta(days=1)
        else:
            break
    return count
