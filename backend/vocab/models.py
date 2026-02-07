from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class VocabPack(models.Model):
    title = models.CharField(max_length=200)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="vocab_packs")
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.title


class VocabWord(models.Model):
    DIFFICULTY_CHOICES = [
        ("easy", "Easy"),
        ("medium", "Medium"),
        ("hard", "Hard"),
    ]

    pack = models.ForeignKey(VocabPack, on_delete=models.CASCADE, related_name="words")
    term = models.CharField(max_length=200)
    definition = models.TextField()
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default="easy")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="vocab_words")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.term

# Create your models here.
