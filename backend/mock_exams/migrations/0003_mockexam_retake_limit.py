from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mock_exams", "0002_rename_mock_exams_mock_ex_74a79e_idx_mock_exams__mock_ex_f6ae2e_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="mockexam",
            name="retake_limit",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
