from rest_framework import serializers
from .models import Course, CourseNode


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "slug", "title", "description", "cover_path"]


class CourseNodeSerializer(serializers.ModelSerializer):
    assignment = serializers.SerializerMethodField()

    class Meta:
        model = CourseNode
        fields = [
            "id",
            "course",
            "parent",
            "kind",
            "name",
            "description",
            "storage_path",
            "mime_type",
            "size_bytes",
            "published",
            "publish_at",
            "assignment_id",
            "assignment",
            "created_by",
            "created_at",
        ]

    def get_assignment(self, obj):
        assignments_map = self.context.get("assignments_map")
        if assignments_map:
            return assignments_map.get(obj.assignment_id)
        return None
