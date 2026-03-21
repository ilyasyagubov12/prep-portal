from rest_framework import serializers
from django.core.files.storage import default_storage
import os
import re
from urllib.parse import urlparse, unquote
import cloudinary.api
from cloudinary.utils import cloudinary_url, private_download_url
from .models import Course, CourseNode


class CourseSerializer(serializers.ModelSerializer):
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ["id", "slug", "title", "description", "cover_path", "cover_url"]

    def get_cover_url(self, obj):
        if not obj.cover_path:
            return None
        try:
            return default_storage.url(obj.cover_path)
        except Exception:
            return obj.cover_path


class CourseNodeSerializer(serializers.ModelSerializer):
    assignment = serializers.SerializerMethodField()
    quiz = serializers.SerializerMethodField()
    storage_url = serializers.SerializerMethodField()

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
            "storage_url",
            "mime_type",
            "size_bytes",
            "published",
            "publish_at",
            "assignment_id",
            "assignment",
            "quiz_id",
            "quiz",
            "created_by",
            "created_at",
        ]

    def get_assignment(self, obj):
        assignments_map = self.context.get("assignments_map")
        if assignments_map:
            return assignments_map.get(obj.assignment_id)
        return None

    def get_quiz(self, obj):
        quizzes_map = self.context.get("quizzes_map")
        if quizzes_map:
            return quizzes_map.get(obj.quiz_id)
        return None

    def get_storage_url(self, obj):
        if not obj.storage_path:
            return None
        request = self.context.get("request")
        relative = f"/api/course-nodes/file/?node_id={obj.id}"
        if request:
            return request.build_absolute_uri(relative)
        return relative
