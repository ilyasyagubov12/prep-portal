from django.urls import path
from .views import (
    QuestionsListCreateView,
    QuestionDetailView,
    QuestionCountsView,
    QuestionImageUploadView,
    QuestionImportView,
)

urlpatterns = [
    path("questions/", QuestionsListCreateView.as_view(), name="questions_list_create"),
    path("questions/<uuid:pk>/", QuestionDetailView.as_view(), name="question_detail"),
    path("questions/counts/", QuestionCountsView.as_view(), name="question_counts"),
    path("questions/upload/", QuestionImageUploadView.as_view(), name="question_image_upload"),
    path("questions/import/", QuestionImportView.as_view(), name="question_import"),
]
