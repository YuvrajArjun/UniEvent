from django.urls import path

from . import views

urlpatterns = [
    path("meta/", views.meta_view, name="meta"),

    path("events/", views.event_list_view, name="event-list"),
    path("events/intra/", views.intra_events_view, name="events-intra"),
    path("events/inter/", views.inter_events_view, name="events-inter"),
    path("events/<int:pk>/", views.event_detail_view, name="event-detail"),
    path("events/<int:pk>/register/", views.event_register_view, name="event-register"),

    path("proposals/", views.proposal_list_create_view, name="proposal-list-create"),
    path("proposals/validate-token/", views.proposal_validate_token_view, name="proposal-validate-token"),
    path("proposals/<int:pk>/approve/", views.proposal_approve_view, name="proposal-approve"),
    path("proposals/<int:pk>/reject/", views.proposal_reject_view, name="proposal-reject"),
    path("proposals/<int:pk>/publish/", views.proposal_publish_view, name="proposal-publish"),

    path("dashboard/stats/", views.dashboard_stats_view, name="dashboard-stats"),
    path("dashboard/registrations/", views.dashboard_registrations_view, name="dashboard-registrations"),
    path("institute/events/", views.institute_events_view, name="institute-events"),
    path("institute/events/<int:pk>/extend/", views.institute_event_extend_view, name="institute-event-extend"),
    path("institute/events/<int:pk>/pull/", views.institute_event_pull_view, name="institute-event-pull"),
    path("institute/events/<int:pk>/terminate/", views.institute_event_terminate_view, name="institute-event-terminate"),

    path("achievements/", views.achievement_list_create_view, name="achievement-list-create"),
    path("achievements/<int:pk>/", views.achievement_detail_view, name="achievement-detail"),

    path("bookmarks/", views.bookmark_list_view, name="bookmark-list"),
    path("bookmarks/<int:event_id>/toggle/", views.bookmark_toggle_view, name="bookmark-toggle"),

    path("registrations/mine/", views.my_registrations_view, name="my-registrations"),
]
