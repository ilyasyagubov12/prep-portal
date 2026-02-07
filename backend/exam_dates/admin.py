from django.contrib import admin
from .models import ExamDate


@admin.register(ExamDate)
class ExamDateAdmin(admin.ModelAdmin):
    list_display = ("id", "date", "created_at")
    list_filter = ("date",)

# Register your models here.
