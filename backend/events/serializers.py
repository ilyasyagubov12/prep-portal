from rest_framework import serializers
from .models import CourseEvent


class CourseEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseEvent
        fields = [
            "id",
            "course",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "repeat_weekly",
            "repeat_until",
            "created_at",
        ]
