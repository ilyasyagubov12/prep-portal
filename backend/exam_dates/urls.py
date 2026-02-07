from django.urls import path
from .views import ExamDateListCreateView, ExamDateSelectView, ExamDateDeleteView


urlpatterns = [
    path("exam-dates/", ExamDateListCreateView.as_view(), name="exam_dates_list"),
    path("exam-dates/select/", ExamDateSelectView.as_view(), name="exam_dates_select"),
    path("exam-dates/<int:pk>/", ExamDateDeleteView.as_view(), name="exam_dates_delete"),
]
