from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0003_coursenode"),
        ("mock_exams", "0004_mockexamaccess"),
    ]

    operations = [
        migrations.AddField(
            model_name="mockexam",
            name="course",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.CASCADE,
                related_name="mock_exams",
                to="courses.course",
            ),
        ),
    ]
