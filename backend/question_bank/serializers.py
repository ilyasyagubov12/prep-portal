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
            "is_open_ended",
            "correct_answer",
            "difficulty",
            "published",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        is_open_ended = attrs.get("is_open_ended")
        choices = attrs.get("choices")

        if is_open_ended:
            return attrs

        if not isinstance(choices, list) or len(choices) < 2:
            raise serializers.ValidationError({"choices": "At least two choices required"})
        if not any(c.get("is_correct") for c in choices):
            raise serializers.ValidationError({"choices": "Mark one choice as correct"})
        return attrs
