from rest_framework import serializers
from .models import Assignment, AssignmentFile, Submission, Grade, OfflineUnit, OfflineGrade


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "id",
            "course",
            "title",
            "body",
            "status",
            "published_at",
            "due_at",
            "max_score",
            "max_submissions",
            "created_by",
            "created_at",
            "updated_at",
        ]


class AssignmentFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentFile
        fields = ["id", "assignment", "name", "storage_path", "mime_type", "size_bytes", "created_at"]


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment",
            "student",
            "file_path",
            "file_name",
            "file_size",
            "mime_type",
            "created_at",
        ]


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ["id", "submission", "grader", "score", "feedback", "graded_at"]


class OfflineUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfflineUnit
        fields = ["id", "course", "title", "max_score", "publish_at", "created_by", "created_at"]


class OfflineGradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfflineGrade
        fields = ["id", "unit", "student", "score", "feedback", "graded_at"]
