from rest_framework import serializers
from .models import User, Profile


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "username"]


class ProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ["user", "nickname", "role", "is_admin", "avatar"]

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
