from django.urls import path

from .views import PaymentsOverviewView, PaymentsSaveView, ReportingAttendanceSaveView, ReportingOverviewView

urlpatterns = [
    path("reports/overview/", ReportingOverviewView.as_view(), name="reports_overview"),
    path("reports/attendance/save/", ReportingAttendanceSaveView.as_view(), name="reports_attendance_save"),
    path("reports/payments/overview/", PaymentsOverviewView.as_view(), name="reports_payments_overview"),
    path("reports/payments/save/", PaymentsSaveView.as_view(), name="reports_payments_save"),
]
