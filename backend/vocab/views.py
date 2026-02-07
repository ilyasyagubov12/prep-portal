from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
import csv
import io
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


class VocabWordImportView(APIView):
    """
    CSV import endpoint for admin/teacher.
    Columns expected:
    pack_id or pack_title, term, definition, difficulty
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=400)

        raw = file.read()
        decoded = None
        for enc in ("utf-8-sig", "utf-8", "iso-8859-1"):
            try:
                decoded = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if decoded is None:
            return Response({"error": "Could not decode file. Please upload UTF-8 CSV."}, status=400)

        reader = csv.DictReader(io.StringIO(decoded))
        created = 0
        errors = []

        for idx, row in enumerate(reader, start=1):
            try:
                pack_id_raw = (row.get("pack_id") or "").strip()
                pack_title = (row.get("pack_title") or "").strip()
                term = (row.get("term") or "").strip()
                definition = (row.get("definition") or "").strip()
                difficulty = (row.get("difficulty") or "easy").strip().lower()

                if difficulty not in ("easy", "medium", "hard"):
                    difficulty = "easy"

                if not term or not definition:
                    raise ValueError("Missing term/definition")

                if pack_id_raw:
                    try:
                        pack = VocabPack.objects.get(id=int(pack_id_raw))
                    except Exception:
                        raise ValueError("Invalid pack_id")
                else:
                    if not pack_title:
                        raise ValueError("Missing pack_title")
                    pack, _ = VocabPack.objects.get_or_create(
                        title=pack_title, defaults={"created_by": request.user}
                    )

                VocabWord.objects.create(
                    pack=pack,
                    term=term,
                    definition=definition,
                    difficulty=difficulty,
                    created_by=request.user,
                )
                created += 1
            except Exception as e:
                errors.append(f"Row {idx}: {e}")

        return Response({"ok": True, "created": created, "errors": errors})

# Create your views here.
