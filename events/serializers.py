from rest_framework import serializers

from accounts.models import College
from .models import Achievement, Bookmark, Event, Proposal, Registration


class EventSerializer(serializers.ModelSerializer):
    cover_image = serializers.SerializerMethodField()
    is_bookmarked = serializers.SerializerMethodField()
    college_id = serializers.ReadOnlyField(source="college.id")
    college_name = serializers.ReadOnlyField(source="college.name")
    college_code = serializers.ReadOnlyField(source="college.code")

    class Meta:
        model = Event
        fields = [
            "id", "title", "institution", "category", "scope", "tags", "date", "venue",
            "city", "description", "fee", "seats_total", "seats_left", "cover_image",
            "status", "source_token", "created_at", "is_bookmarked",
            "college_id", "college_name", "college_code",
        ]

    def get_cover_image(self, obj):
        if obj.cover_upload:
            request = self.context.get("request")
            url = obj.cover_upload.url
            return request.build_absolute_uri(url) if request else url
        return obj.cover_image_url

    def get_is_bookmarked(self, obj):
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_authenticated:
            return False
        if hasattr(obj, "_bookmarked_event_ids"):
            return obj.id in obj._bookmarked_event_ids
        return Bookmark.objects.filter(student=user, event=obj).exists()


class ProposalSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.name", read_only=True)
    student_affiliation = serializers.SerializerMethodField()
    target_college_id = serializers.ReadOnlyField(source="target_college.id")
    target_college_name = serializers.ReadOnlyField(source="target_college.name")

    class Meta:
        model = Proposal
        fields = [
            "id", "student", "student_name", "student_affiliation",
            "target_college", "target_college_id", "target_college_name",
            "title", "aim", "scope", "date", "venue", "budget", "status",
            "rejection_reason", "token", "published", "submitted_at",
        ]
        read_only_fields = ["status", "token", "published", "submitted_at", "student"]

    def get_student_affiliation(self, obj):
        profile = getattr(obj.student, "student_profile", None)
        if profile:
            return profile.college.name if profile.college else profile.affiliation
        return ""


class ProposalCreateSerializer(serializers.ModelSerializer):
    target_college = serializers.PrimaryKeyRelatedField(
        queryset=College.objects.filter(is_active=True), required=False, allow_null=True
    )

    class Meta:
        model = Proposal
        fields = ["id", "title", "aim", "scope", "date", "venue", "budget", "target_college"]

    def validate_title(self, value):
        if len(value.strip()) < 4:
            raise serializers.ValidationError("Give the event a descriptive title (4+ characters).")
        return value.strip()

    def validate_aim(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Describe the aim in a bit more detail.")
        return value.strip()

    def validate_venue(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Describe the venue requirement.")
        return value.strip()


class PublishProposalSerializer(serializers.Serializer):
    category = serializers.CharField()
    fee = serializers.IntegerField(min_value=0, default=0)
    seats_total = serializers.IntegerField(min_value=1)
    tags = serializers.CharField(required=False, allow_blank=True, default="")
    cover_image_url = serializers.URLField(required=False, allow_blank=True, default="")
    cover_upload = serializers.ImageField(required=False, allow_null=True)


class RegistrationSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_institution = serializers.CharField(source="event.institution", read_only=True)
    event_id = serializers.IntegerField(source="event.id", read_only=True)

    class Meta:
        model = Registration
        fields = [
            "id", "event", "event_id", "event_title", "event_institution",
            "registration_type", "attendee_name", "attendee_id",
            "affiliation", "email", "fee_paid", "gst", "total_paid", "transaction_hash", "registered_at",
        ]
        read_only_fields = ["registration_type", "fee_paid", "gst", "total_paid", "transaction_hash", "registered_at"]



class RegistrationCreateSerializer(serializers.Serializer):
    attendee_name = serializers.CharField()
    attendee_id = serializers.CharField()
    affiliation = serializers.CharField()
    email = serializers.EmailField()


class AchievementSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Achievement
        fields = ["id", "title", "issuer", "date", "image", "added_at"]

    def get_image(self, obj):
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class AchievementWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = ["title", "issuer", "date", "image"]
        extra_kwargs = {"image": {"required": False}}
