from rest_framework import serializers
from .models import User, Profile


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "username", "first_name", "last_name"]


class ProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    avatar = serializers.SerializerMethodField()
    university_icon = serializers.SerializerMethodField()
    selected_exam_date = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "user",
            "nickname",
            "student_id",
            "role",
            "is_admin",
            "avatar",
            "university_icon",
            "selected_exam_date",
            "goal_math",
            "goal_verbal",
            "math_level",
            "verbal_level",
            "phone_number",
            "parent_name",
            "parent_phone",
        ]

    def get_avatar(self, obj):
        url = obj.avatar
        if not url:
            return None
        # If already absolute, return as is
        if isinstance(url, str) and url.startswith("http"):
            return url
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_university_icon(self, obj):
        url = obj.university_icon
        if not url:
            return None
        if isinstance(url, str) and url.startswith("http"):
            return url
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_selected_exam_date(self, obj):
        d = getattr(obj, "selected_exam_date", None)
        if not d:
            return None
        return {"id": d.id, "date": d.date.isoformat()}
