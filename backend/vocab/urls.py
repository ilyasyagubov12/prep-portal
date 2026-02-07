from django.urls import path
from .views import (
    VocabPackListCreateView,
    VocabPackDetailView,
    VocabWordCreateView,
    VocabWordDetailView,
    VocabWordImportView,
)


urlpatterns = [
    path("vocab/packs/", VocabPackListCreateView.as_view(), name="vocab_packs"),
    path("vocab/packs/<int:pk>/", VocabPackDetailView.as_view(), name="vocab_pack_detail"),
    path("vocab/words/", VocabWordCreateView.as_view(), name="vocab_word_create"),
    path("vocab/words/import/", VocabWordImportView.as_view(), name="vocab_word_import"),
    path("vocab/words/<int:pk>/", VocabWordDetailView.as_view(), name="vocab_word_detail"),
]
