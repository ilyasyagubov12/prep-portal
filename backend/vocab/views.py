from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .models import VocabPack, VocabWord
from .serializers import VocabPackSerializer, VocabWordSerializer


User = get_user_model()


def is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return user.is_superuser or getattr(prof, "is_admin", False) or role in ("admin", "teacher")


class VocabPackListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = VocabPack.objects.all().order_by("-created_at")
        if not is_staff(request.user):
            qs = qs.filter(published=True)
        data = VocabPackSerializer(qs, many=True).data
        return Response({"ok": True, "packs": data})

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title required"}, status=status.HTTP_400_BAD_REQUEST)
        pack = VocabPack.objects.create(title=title, created_by=request.user)
        return Response({"ok": True, "pack": VocabPackSerializer(pack).data})


class VocabPackDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        try:
            pack = VocabPack.objects.get(id=pk)
        except VocabPack.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        pack.delete()
        return Response({"ok": True})


class VocabWordCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        serializer = VocabWordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        word = serializer.save(created_by=request.user)
        return Response({"ok": True, "word": VocabWordSerializer(word).data})


class VocabWordDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        try:
            word = VocabWord.objects.get(id=pk)
        except VocabWord.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        word.delete()
        return Response({"ok": True})

# Create your views here.
