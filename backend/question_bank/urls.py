from django.urls import path
from .views import (
    QuestionsListCreateView,
    QuestionDetailView,
    QuestionCountsView,
    QuestionImageUploadView,
    QuestionImportView,
    QuestionBookExportView,
    QuestionProgressView,
    QuestionSetProgressView,
    QuestionQuizView,
    QuestionQuizSubmitView,
)

urlpatterns = [
    path("questions/", QuestionsListCreateView.as_view(), name="questions_list_create"),
    path("questions/<uuid:pk>/", QuestionDetailView.as_view(), name="question_detail"),
    path("questions/counts/", QuestionCountsView.as_view(), name="question_counts"),
    path("questions/export/", QuestionBookExportView.as_view(), name="question_book_export"),
    path("questions/upload/", QuestionImageUploadView.as_view(), name="question_image_upload"),
    path("questions/import/", QuestionImportView.as_view(), name="question_import"),
    path("questions/progress/", QuestionProgressView.as_view(), name="question_progress"),
    path("questions/set-progress/", QuestionSetProgressView.as_view(), name="question_set_progress"),
    path("questions/quiz/", QuestionQuizView.as_view(), name="question_quiz"),
    path("questions/quiz/submit/", QuestionQuizSubmitView.as_view(), name="question_quiz_submit"),
]
