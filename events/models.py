from django.conf import settings
from django.db import models


class Event(models.Model):
    SCOPE_INTER = "Intercollege"
    SCOPE_INTRA = "Intracollege"
    SCOPE_CHOICES = [(SCOPE_INTER, "Intercollege"), (SCOPE_INTRA, "Intracollege")]

    STATUS_ACTIVE = "active"
    STATUS_EXTENDED = "extended"
    STATUS_PULLED = "pulled"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_EXTENDED, "Extended"),
        (STATUS_PULLED, "Pulled"),
    ]

    title = models.CharField(max_length=250)
    institution = models.CharField(max_length=200)
    category = models.CharField(max_length=50)
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default=SCOPE_INTER)
    tags = models.JSONField(default=list, blank=True)
    date = models.DateField()
    venue = models.CharField(max_length=250)
    city = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    fee = models.PositiveIntegerField(default=0)
    seats_total = models.PositiveIntegerField(default=0)
    seats_left = models.PositiveIntegerField(default=0)
    cover_image_url = models.URLField(max_length=500, blank=True)
    cover_upload = models.ImageField(upload_to="event_covers/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    source_token = models.CharField(max_length=100, blank=True)
    college = models.ForeignKey(
        "accounts.College", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="events",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="events_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return self.title


class Proposal(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="proposals")
    target_college = models.ForeignKey(
        "accounts.College", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="proposals",
    )
    title = models.CharField(max_length=250)
    aim = models.TextField()
    scope = models.CharField(max_length=20, choices=Event.SCOPE_CHOICES, default=Event.SCOPE_INTER)
    date = models.DateField()
    venue = models.CharField(max_length=250)
    budget = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    rejection_reason = models.TextField(blank=True)
    token = models.CharField(max_length=100, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="approved_proposals",
    )
    published = models.BooleanField(default=False)
    published_event = models.ForeignKey(
        Event, null=True, blank=True, on_delete=models.SET_NULL, related_name="source_proposal",
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return self.title


class Registration(models.Model):
    REGISTRATION_INTRA = "INTRA_COLLEGE"
    REGISTRATION_INTER = "INTER_COLLEGE"
    REGISTRATION_CHOICES = [
        (REGISTRATION_INTRA, "Intra-College"),
        (REGISTRATION_INTER, "Inter-College"),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="registrations")
    registration_type = models.CharField(max_length=20, choices=REGISTRATION_CHOICES, default=REGISTRATION_INTER)
    attendee_name = models.CharField(max_length=150)
    attendee_id = models.CharField(max_length=50)
    affiliation = models.CharField(max_length=200)
    email = models.EmailField()
    fee_paid = models.PositiveIntegerField(default=0)
    gst = models.PositiveIntegerField(default=0)
    total_paid = models.PositiveIntegerField(default=0)
    transaction_hash = models.CharField(max_length=100, unique=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-registered_at"]

    def __str__(self):
        return f"{self.attendee_name} -> {self.event.title}"


class Achievement(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievements")
    title = models.CharField(max_length=200)
    issuer = models.CharField(max_length=200)
    date = models.DateField()
    image = models.ImageField(upload_to="achievements/")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-added_at"]

    def __str__(self):
        return self.title


class Bookmark(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookmarks")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="bookmarked_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("student", "event")
