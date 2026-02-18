from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mock_exams", "0005_mockexam_course"),
    ]

    operations = [
        migrations.AddField(
            model_name="mockexam",
            name="question_overrides",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
