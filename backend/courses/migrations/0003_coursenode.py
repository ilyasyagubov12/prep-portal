from django.db import migrations, models
import uuid
from django.conf import settings


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0002_course_cover_path"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CourseNode",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("kind", models.CharField(max_length=20, choices=[("folder", "folder"), ("file", "file"), ("assignment", "assignment")])),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, null=True)),
                ("storage_path", models.TextField(blank=True, null=True)),
                ("mime_type", models.CharField(max_length=120, blank=True, null=True)),
                ("size_bytes", models.BigIntegerField(blank=True, null=True)),
                ("published", models.BooleanField(default=True)),
                ("publish_at", models.DateTimeField(blank=True, null=True)),
                ("assignment_id", models.UUIDField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("course", models.ForeignKey(on_delete=models.CASCADE, related_name="nodes", to="courses.course")),
                ("parent", models.ForeignKey(on_delete=models.CASCADE, related_name="children", to="courses.coursenode", null=True, blank=True)),
                ("created_by", models.ForeignKey(on_delete=models.SET_NULL, null=True, blank=True, to=settings.AUTH_USER_MODEL, related_name="created_course_nodes")),
            ],
        ),
    ]
