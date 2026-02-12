from django.urls import path
from .views import StreakStatusView, StreakAttemptView, QuestionAttemptStatusView

urlpatterns = [
    path("streak/status/", StreakStatusView.as_view(), name="streak_status"),
    path("streak/attempt/", StreakAttemptView.as_view(), name="streak_attempt"),
    path("streak/attempts/", QuestionAttemptStatusView.as_view(), name="streak_attempts_status"),
]
