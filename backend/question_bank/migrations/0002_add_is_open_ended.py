from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="is_open_ended",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="question",
            name="correct_answer",
            field=models.TextField(blank=True, null=True),
        ),
    ]
