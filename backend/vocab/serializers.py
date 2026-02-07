from rest_framework import serializers
from .models import VocabPack, VocabWord


class VocabWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = VocabWord
        fields = ["id", "pack", "term", "definition", "difficulty", "created_at"]


class VocabWordReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = VocabWord
        fields = ["id", "term", "definition", "difficulty", "created_at"]


class VocabPackSerializer(serializers.ModelSerializer):
    words = VocabWordReadSerializer(many=True, read_only=True)

    class Meta:
        model = VocabPack
        fields = ["id", "title", "created_by", "published", "created_at", "words"]
