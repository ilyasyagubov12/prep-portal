from rest_framework import serializers
import os
from django.core.files.storage import default_storage
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
            url = default_storage.url(obj.cover_path)
            if "res.cloudinary.com" in url and "/image/upload/" in url:
                return url
            return url
        except Exception:
            return obj.cover_path


class CourseNodeSerializer(serializers.ModelSerializer):
    assignment = serializers.SerializerMethodField()
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
            "created_by",
            "created_at",
        ]

    def get_assignment(self, obj):
        assignments_map = self.context.get("assignments_map")
        if assignments_map:
            return assignments_map.get(obj.assignment_id)
        return None

    def get_storage_url(self, obj):
        if not obj.storage_path:
            return None
        try:
            url = default_storage.url(obj.storage_path)
            if "res.cloudinary.com" in url and "/image/upload/" in url:
                if obj.mime_type and obj.mime_type.startswith("video/"):
                    return url.replace("/image/upload/", "/video/upload/")
                if obj.mime_type and not obj.mime_type.startswith("image/"):
                    return url.replace("/image/upload/", "/raw/upload/")
                ext = os.path.splitext(obj.storage_path)[1].lower()
                if ext in {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip", ".rar", ".txt"}:
                    return url.replace("/image/upload/", "/raw/upload/")
            return url
        except Exception:
            return obj.storage_path
