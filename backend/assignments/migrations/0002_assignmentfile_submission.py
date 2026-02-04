from django.db import migrations, models
import uuid
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0001_initial'),
        ('courses', '0003_coursenode'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AssignmentFile',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('storage_path', models.TextField()),
                ('mime_type', models.CharField(max_length=150, blank=True, null=True)),
                ('size_bytes', models.BigIntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('assignment', models.ForeignKey(on_delete=models.CASCADE, related_name='files', to='assignments.assignment')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='assignment_files', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Submission',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('file_path', models.TextField()),
                ('file_name', models.CharField(max_length=255, blank=True, null=True)),
                ('file_size', models.BigIntegerField(blank=True, null=True)),
                ('mime_type', models.CharField(max_length=150, blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('assignment', models.ForeignKey(on_delete=models.CASCADE, related_name='submissions', to='assignments.assignment')),
                ('student', models.ForeignKey(on_delete=models.CASCADE, related_name='submissions', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
