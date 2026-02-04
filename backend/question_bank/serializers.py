from rest_framework import serializers
from .models import Question


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = [
            "id",
            "subject",
            "topic",
            "subtopic",
            "stem",
            "passage",
            "explanation",
            "image_url",
            "choices",
            "difficulty",
            "published",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate_choices(self, value):
        if not isinstance(value, list) or len(value) < 2:
            raise serializers.ValidationError("At least two choices required")
        if not any(c.get("is_correct") for c in value):
            raise serializers.ValidationError("Mark one choice as correct")
        return value
