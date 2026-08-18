from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("about/", views.about, name="about"),
    path("achievements/", views.achievements, name="achievements"),
    path("conduct-event/", views.conduct_event, name="conduct-event"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("verify-ticket/<str:transaction_hash>/", views.verify_ticket, name="verify-ticket"),
    path("scan-ticket/", views.scan_ticket, name="scan-ticket"),
    path("control-panel/", views.control_panel, name="control-panel"),
]
