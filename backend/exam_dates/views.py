from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import ExamDate


User = get_user_model()


def is_staff(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return user.is_superuser or getattr(prof, "is_admin", False) or role in ("admin", "teacher")


class ExamDateListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        qs = ExamDate.objects.filter(date__gte=today).order_by("date")
        data = [{"id": d.id, "date": d.date.isoformat()} for d in qs]
        return Response({"ok": True, "dates": data})

    def post(self, request):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        date_str = (request.data.get("date") or "").strip()
        if not date_str:
            return Response({"error": "date required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            date_val = timezone.datetime.fromisoformat(date_str).date()
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        today = timezone.localdate()
        if date_val < today:
            return Response({"error": "Date must be today or later"}, status=status.HTTP_400_BAD_REQUEST)
        obj, _ = ExamDate.objects.get_or_create(date=date_val, defaults={"created_by": request.user})
        return Response({"ok": True, "date": {"id": obj.id, "date": obj.date.isoformat()}})


class ExamDateSelectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        date_id = request.data.get("date_id")
        if not date_id:
            return Response({"error": "date_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            obj = ExamDate.objects.get(id=int(date_id))
        except Exception:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        today = timezone.localdate()
        if obj.date < today:
            return Response({"error": "Date has already passed"}, status=status.HTTP_400_BAD_REQUEST)
        prof = request.user.profile
        prof.selected_exam_date = obj
        prof.save(update_fields=["selected_exam_date"])
        return Response({"ok": True, "selected": {"id": obj.id, "date": obj.date.isoformat()}})


class ExamDateDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if not is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        try:
            obj = ExamDate.objects.get(id=pk)
        except ExamDate.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response({"ok": True})

# Create your views here.
