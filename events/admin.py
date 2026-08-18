from django.contrib import admin

from .models import Achievement, Bookmark, Event, Proposal, Registration


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "college", "institution", "category", "scope", "date", "status", "seats_left", "seats_total"]
    list_filter = ["college", "category", "scope", "status"]
    search_fields = ["title", "institution"]


@admin.register(Proposal)
class ProposalAdmin(admin.ModelAdmin):
    list_display = ["title", "student", "target_college", "status", "date", "submitted_at", "published"]
    list_filter = ["target_college", "status", "published"]
    search_fields = ["title", "student__name"]


@admin.register(Registration)
class RegistrationAdmin(admin.ModelAdmin):
    list_display = ["attendee_name", "event", "registration_type", "transaction_hash", "total_paid", "registered_at"]
    list_filter = ["registration_type"]
    search_fields = ["attendee_name", "transaction_hash"]


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ["title", "student", "issuer", "date"]


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = ["student", "event", "created_at"]
