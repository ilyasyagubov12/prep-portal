from django.contrib import admin
from .models import VocabPack, VocabWord


@admin.register(VocabPack)
class VocabPackAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "published", "created_at")
    search_fields = ("title",)
    list_filter = ("published",)


@admin.register(VocabWord)
class VocabWordAdmin(admin.ModelAdmin):
    list_display = ("id", "term", "difficulty", "pack", "created_at")
    search_fields = ("term", "definition")
    list_filter = ("difficulty", "pack")

# Register your models here.
