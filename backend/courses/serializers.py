from rest_framework import serializers
from django.core.files.storage import default_storage
import os
from cloudinary.utils import cloudinary_url
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
        # If Cloudinary is configured, return a signed URL so protected assets load.
        if os.getenv("CLOUDINARY_URL"):
            path = obj.storage_path
            mime = (obj.mime_type or "").lower()
            lower = path.lower()
            if mime.startswith("image/") or lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                resource_type = "image"
            elif mime == "application/pdf" or lower.endswith(".pdf"):
                resource_type = "raw"
            else:
                resource_type = "raw"
            url, _ = cloudinary_url(
                path,
                resource_type=resource_type,
                type="upload",
                secure=True,
                sign_url=True,
            )
            return url
        try:
            return default_storage.url(obj.storage_path)
        except Exception:
            return obj.storage_path
