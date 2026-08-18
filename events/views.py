from datetime import timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.core.mail import send_mail
from django.urls import reverse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import constants
from .models import Achievement, Bookmark, Event, Proposal, Registration
from .serializers import (
    AchievementSerializer,
    AchievementWriteSerializer,
    EventSerializer,
    ProposalCreateSerializer,
    ProposalSerializer,
    PublishProposalSerializer,
    RegistrationCreateSerializer,
    RegistrationSerializer,
)
from .utils import generate_token, generate_transaction_hash


def _role_error(role):
    return Response({"detail": f"This area needs a {role} login."}, status=status.HTTP_403_FORBIDDEN)


def _attach_bookmarks(events, user):
    """Avoids an N+1 query: fetch the current user's bookmarked event ids once
    and stamp them onto each event instance for the serializer to read."""
    ids = set()
    if user and user.is_authenticated:
        ids = set(Bookmark.objects.filter(student=user).values_list("event_id", flat=True))
    for e in events:
        e._bookmarked_event_ids = ids
    return events


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def meta_view(request):
    return Response({
        "categories": constants.CATEGORIES,
        "scopes": constants.SCOPES,
        "cities": constants.INDIAN_CITIES,
    })


# ---------------------------------------------------------------------------
# Events feed
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Events feed
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def event_list_view(request):
    qs = Event.objects.exclude(status=Event.STATUS_PULLED)

    city = request.query_params.get("city")
    if city:
        qs = qs.filter(Q(city=city) | Q(city=""))

    category = request.query_params.get("category")
    if category and category != "All":
        qs = qs.filter(category=category)

    scope = request.query_params.get("scope")
    if scope and scope != "All":
        qs = qs.filter(scope=scope)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(title__icontains=q) | Q(institution__icontains=q) | Q(tags__icontains=q)
        )

    sort = request.query_params.get("sort", "date-asc")
    sort_map = {
        "date-asc": "date",
        "date-desc": "-date",
        "fee-asc": "fee",
        "seats-desc": "-seats_left",
    }
    qs = qs.order_by(sort_map.get(sort, "date"))

    events = _attach_bookmarks(list(qs), request.user)
    serializer = EventSerializer(events, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def intra_events_view(request):
    """Returns events organized by the authenticated student's own college."""
    if not request.user or not request.user.is_authenticated or request.user.role != "student":
        return Response([])

    student_profile = getattr(request.user, "student_profile", None)
    student_college = student_profile.college if student_profile else None

    if not student_college:
        return Response([])

    qs = Event.objects.exclude(status=Event.STATUS_PULLED).filter(college=student_college)

    city = request.query_params.get("city")
    if city:
        qs = qs.filter(Q(city=city) | Q(city=""))

    category = request.query_params.get("category")
    if category and category != "All":
        qs = qs.filter(category=category)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(title__icontains=q) | Q(institution__icontains=q) | Q(tags__icontains=q)
        )

    sort = request.query_params.get("sort", "date-asc")
    sort_map = {
        "date-asc": "date",
        "date-desc": "-date",
        "fee-asc": "fee",
        "seats-desc": "-seats_left",
    }
    qs = qs.order_by(sort_map.get(sort, "date"))

    events = _attach_bookmarks(list(qs), request.user)
    serializer = EventSerializer(events, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def inter_events_view(request):
    """Returns events from colleges other than the student's own college, with optional college filter."""
    qs = Event.objects.exclude(status=Event.STATUS_PULLED)

    student_college = None
    if request.user and request.user.is_authenticated and request.user.role == "student":
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile:
            student_college = student_profile.college

    if student_college:
        qs = qs.exclude(college=student_college)

    college_id = request.query_params.get("college_id")
    if college_id and college_id != "All":
        try:
            qs = qs.filter(college_id=int(college_id))
        except (ValueError, TypeError):
            pass

    city = request.query_params.get("city")
    if city:
        qs = qs.filter(Q(city=city) | Q(city=""))

    category = request.query_params.get("category")
    if category and category != "All":
        qs = qs.filter(category=category)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(title__icontains=q) | Q(institution__icontains=q) | Q(tags__icontains=q)
        )

    sort = request.query_params.get("sort", "date-asc")
    sort_map = {
        "date-asc": "date",
        "date-desc": "-date",
        "fee-asc": "fee",
        "seats-desc": "-seats_left",
    }
    qs = qs.order_by(sort_map.get(sort, "date"))

    events = _attach_bookmarks(list(qs), request.user)
    serializer = EventSerializer(events, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def event_detail_view(request, pk):
    event = get_object_or_404(Event, pk=pk)
    _attach_bookmarks([event], request.user)
    return Response(EventSerializer(event, context={"request": request}).data)


def _send_ticket_email(request, registration):
    event = registration.event
    verify_url = request.build_absolute_uri(
        reverse("verify-ticket", args=[registration.transaction_hash])
    )
    
    subject = f"Your UniEvents Ticket Pass: {event.title}"
    body = (
        f"Hi {registration.attendee_name},\n\n"
        f"Your registration for \"{event.title}\" is confirmed!\n\n"
        f"Event Details:\n"
        f"- Title: {event.title}\n"
        f"- Venue: {event.venue}\n"
        f"- Date: {event.date}\n"
        f"- Organizer: {event.institution}\n"
        f"- Registration Type: {registration.get_registration_type_display()}\n\n"
        f"Attendee Details:\n"
        f"- Name: {registration.attendee_name}\n"
        f"- Student/Attendee ID: {registration.attendee_id}\n"
        f"- Affiliation: {registration.affiliation}\n\n"
        f"Transaction Details:\n"
        f"- Transaction Hash: {registration.transaction_hash}\n"
        f"- Amount Paid: {registration.total_paid} INR (Fee: {registration.fee_paid} + GST: {registration.gst})\n\n"
        f"To verify your ticket at entry, show this unique verification link:\n"
        f"{verify_url}\n\n"
        f"Thank you,\n"
        f"The UniEvents Team"
    )
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email="noreply@unievents.edu",
            recipient_list=[registration.email],
            fail_silently=True,
        )
    except Exception as e:
        print(f"Failed to send ticket email: {e}")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_register_view(request, pk):
    if request.user.role != "student":
        return _role_error("student")
    event = get_object_or_404(Event, pk=pk)
    if event.seats_left <= 0:
        return Response({"detail": "This event is sold out."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = RegistrationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Backend automatically determines registration_type based on student's college vs event's college
    student_profile = getattr(request.user, "student_profile", None)
    student_college = student_profile.college if student_profile else None

    if student_college and event.college and student_college == event.college:
        registration_type = Registration.REGISTRATION_INTRA
    else:
        registration_type = Registration.REGISTRATION_INTER

    gst = round(event.fee * 0.18)
    total = event.fee + gst

    registration = Registration.objects.create(
        event=event,
        student=request.user,
        registration_type=registration_type,
        attendee_name=data["attendee_name"],
        attendee_id=data["attendee_id"],
        affiliation=data["affiliation"],
        email=data["email"],
        fee_paid=event.fee,
        gst=gst,
        total_paid=total,
        transaction_hash=generate_transaction_hash(),
    )
    event.seats_left -= 1
    event.save(update_fields=["seats_left"])

    _send_ticket_email(request, registration)

    return Response(RegistrationSerializer(registration).data, status=status.HTTP_201_CREATED)



# ---------------------------------------------------------------------------
# Proposals (Conduct-an-Event lifecycle)
# ---------------------------------------------------------------------------
def _check_college_admin_permission(user, proposal):
    inst_profile = getattr(user, "institute_profile", None)
    if not inst_profile:
        return False
    if proposal.target_college and inst_profile.college:
        return proposal.target_college == inst_profile.college
    if inst_profile.institution_name and proposal.target_college:
        inst_name = inst_profile.institution_name.lower()
        coll_name = proposal.target_college.name.lower()
        return inst_name in coll_name or coll_name in inst_name
    return True


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def proposal_list_create_view(request):
    if request.method == "POST":
        if request.user.role != "student":
            return _role_error("student")
        serializer = ProposalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target_college = data.get("target_college")
        if not target_college:
            student_profile = getattr(request.user, "student_profile", None)
            target_college = student_profile.college if student_profile else None

        proposal = serializer.save(student=request.user, target_college=target_college)
        return Response(ProposalSerializer(proposal).data, status=status.HTTP_201_CREATED)

    # GET
    if request.user.role == "student":
        qs = Proposal.objects.filter(student=request.user)
    else:
        inst_profile = getattr(request.user, "institute_profile", None)
        inst_college = inst_profile.college if inst_profile else None
        if inst_college:
            qs = Proposal.objects.filter(target_college=inst_college)
        else:
            institution_name = getattr(inst_profile, "institution_name", "")
            qs = Proposal.objects.filter(
                Q(target_college__name__iexact=institution_name)
                | Q(student__student_profile__affiliation__iexact=institution_name)
            )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(student__name__icontains=q)
                | Q(student__student_profile__affiliation__icontains=q)
            )
    return Response(ProposalSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def proposal_approve_view(request, pk):
    if request.user.role != "institute":
        return _role_error("institute")
    proposal = get_object_or_404(Proposal, pk=pk)
    if not _check_college_admin_permission(request.user, proposal):
        return Response({"detail": "Permission denied. You can only manage proposals for your own college."}, status=status.HTTP_403_FORBIDDEN)

    proposal.status = Proposal.STATUS_APPROVED
    proposal.token = generate_token()
    proposal.approved_by = request.user
    proposal.save(update_fields=["status", "token", "approved_by"])
    return Response(ProposalSerializer(proposal).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def proposal_reject_view(request, pk):
    if request.user.role != "institute":
        return _role_error("institute")
    proposal = get_object_or_404(Proposal, pk=pk)
    if not _check_college_admin_permission(request.user, proposal):
        return Response({"detail": "Permission denied. You can only manage proposals for your own college."}, status=status.HTTP_403_FORBIDDEN)

    reason = (request.data.get("rejection_reason") or request.data.get("reason") or "").strip()
    proposal.status = Proposal.STATUS_REJECTED
    proposal.rejection_reason = reason
    proposal.save(update_fields=["status", "rejection_reason"])
    return Response(ProposalSerializer(proposal).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def proposal_validate_token_view(request):
    if request.user.role != "institute":
        return _role_error("institute")
    token = (request.data.get("token") or "").strip()
    if not token:
        return Response({"detail": "Paste a token first."}, status=status.HTTP_400_BAD_REQUEST)
    
    inst_profile = getattr(request.user, "institute_profile", None)
    inst_college = inst_profile.college if inst_profile else None
    
    proposal = Proposal.objects.filter(token=token, status=Proposal.STATUS_APPROVED).first()
    if not proposal:
        return Response({"detail": "No approved proposal matches that token."}, status=status.HTTP_404_NOT_FOUND)
    if inst_college and proposal.target_college and proposal.target_college != inst_college:
        return Response({"detail": "This approval token belongs to another college."}, status=status.HTTP_403_FORBIDDEN)
    if proposal.published:
        return Response({"detail": "This token has already been published to the feed."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ProposalSerializer(proposal).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def proposal_publish_view(request, pk):
    proposal = get_object_or_404(Proposal, pk=pk)
    is_owner = proposal.student_id == request.user.id
    is_institute = request.user.role == "institute"
    if not (is_owner or is_institute):
        return Response(
            {"detail": "Only the proposing student or an institution can publish this."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if is_institute and not _check_college_admin_permission(request.user, proposal):
        return Response({"detail": "Permission denied. You can only publish proposals for your own college."}, status=status.HTTP_403_FORBIDDEN)
    if proposal.status != Proposal.STATUS_APPROVED:
        return Response({"detail": "Only approved proposals can be published."}, status=status.HTTP_400_BAD_REQUEST)
    if proposal.published:
        return Response({"detail": "This proposal has already been published."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = PublishProposalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    tags = [t.strip() for t in (data.get("tags") or "").split(",") if t.strip()]

    target_college = proposal.target_college
    if is_institute:
        inst_profile = getattr(request.user, "institute_profile", None)
        institution_name = target_college.name if target_college else (getattr(inst_profile, "institution_name", "") or "—")
        scope = proposal.scope or Event.SCOPE_INTER
        if not target_college and inst_profile:
            target_college = inst_profile.college
    else:
        institution_name = target_college.name if target_college else (getattr(getattr(proposal.student, "student_profile", None), "affiliation", "") or "Student-Organized")
        scope = proposal.scope or Event.SCOPE_INTRA

    event = Event.objects.create(
        title=proposal.title,
        institution=institution_name,
        college=target_college,
        category=data["category"],
        scope=scope,
        tags=tags,
        date=proposal.date,
        venue=proposal.venue,
        city=getattr(request.user, "city", "") or "",
        description=proposal.aim,
        fee=data["fee"],
        seats_total=data["seats_total"],
        seats_left=data["seats_total"],
        cover_image_url=data.get("cover_image_url") or "",
        cover_upload=data.get("cover_upload"),
        status=Event.STATUS_ACTIVE,
        source_token=proposal.token,
        created_by=request.user,
    )

    proposal.published = True
    proposal.published_event = event
    proposal.save(update_fields=["published", "published_event"])

    return Response(EventSerializer(event, context={"request": request}).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Institute dashboard
# ---------------------------------------------------------------------------
def _get_institute_events(user):
    inst_profile = getattr(user, "institute_profile", None)
    inst_college = inst_profile.college if inst_profile else None
    institution_name = getattr(inst_profile, "institution_name", "")
    if inst_college:
        return Event.objects.filter(college=inst_college)
    return Event.objects.filter(institution=institution_name)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats_view(request):
    if request.user.role != "institute":
        return _role_error("institute")

    inst_profile = getattr(request.user, "institute_profile", None)
    inst_college = inst_profile.college if inst_profile else None
    institution_name = getattr(inst_profile, "institution_name", "")

    if inst_college:
        proposal_qs = Proposal.objects.filter(target_college=inst_college)
    else:
        proposal_qs = Proposal.objects.filter(
            Q(target_college__name__iexact=institution_name)
            | Q(student__student_profile__affiliation__iexact=institution_name)
        )

    my_listings = _get_institute_events(request.user)

    pending = proposal_qs.filter(status=Proposal.STATUS_PENDING).count()
    tokens_issued = proposal_qs.filter(status=Proposal.STATUS_APPROVED).count()
    active = my_listings.exclude(status=Event.STATUS_PULLED).count()
    seats_open = sum(e.seats_left for e in my_listings)

    reg_qs = Registration.objects.filter(event__in=my_listings)
    total_registrations = reg_qs.count()
    intra_registrations = reg_qs.filter(registration_type=Registration.REGISTRATION_INTRA).count()
    inter_registrations = reg_qs.filter(registration_type=Registration.REGISTRATION_INTER).count()

    return Response({
        "pending_review": pending,
        "active_listings": active,
        "seats_open": seats_open,
        "tokens_issued": tokens_issued,
        "total_registrations": total_registrations,
        "intra_registrations": intra_registrations,
        "inter_registrations": inter_registrations,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_registrations_view(request):
    """Registration management center for college admins."""
    if request.user.role != "institute":
        return _role_error("institute")

    my_listings = _get_institute_events(request.user)
    qs = Registration.objects.filter(event__in=my_listings)

    reg_type = request.query_params.get("type") or request.query_params.get("registration_type")
    if reg_type and reg_type != "All":
        if reg_type in [Registration.REGISTRATION_INTRA, "intra", "Intra-College"]:
            qs = qs.filter(registration_type=Registration.REGISTRATION_INTRA)
        elif reg_type in [Registration.REGISTRATION_INTER, "inter", "Inter-College"]:
            qs = qs.filter(registration_type=Registration.REGISTRATION_INTER)

    event_id = request.query_params.get("event_id")
    if event_id:
        qs = qs.filter(event_id=event_id)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(attendee_name__icontains=q)
            | Q(attendee_id__icontains=q)
            | Q(affiliation__icontains=q)
            | Q(email__icontains=q)
            | Q(event__title__icontains=q)
        )

    return Response(RegistrationSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def institute_events_view(request):
    if request.user.role != "institute":
        return _role_error("institute")
    events = _get_institute_events(request.user)
    return Response(EventSerializer(events, many=True, context={"request": request}).data)


def _get_owned_institute_event(request, pk):
    events = _get_institute_events(request.user)
    return get_object_or_404(events, pk=pk)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def institute_event_extend_view(request, pk):
    if request.user.role != "institute":
        return _role_error("institute")
    event = _get_owned_institute_event(request, pk)
    event.date = event.date + timedelta(days=7)
    event.status = Event.STATUS_EXTENDED
    event.save(update_fields=["date", "status"])
    return Response(EventSerializer(event, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def institute_event_pull_view(request, pk):
    if request.user.role != "institute":
        return _role_error("institute")
    event = _get_owned_institute_event(request, pk)
    event.status = Event.STATUS_PULLED
    event.save(update_fields=["status"])
    return Response(EventSerializer(event, context={"request": request}).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def institute_event_terminate_view(request, pk):
    if request.user.role != "institute":
        return _role_error("institute")
    event = _get_owned_institute_event(request, pk)
    event.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Achievements locker
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def achievement_list_create_view(request):
    if request.user.role != "student":
        return _role_error("student")

    if request.method == "POST":
        serializer = AchievementWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        achievement = serializer.save(student=request.user)
        return Response(
            AchievementSerializer(achievement, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    items = Achievement.objects.filter(student=request.user)
    return Response(AchievementSerializer(items, many=True, context={"request": request}).data)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def achievement_detail_view(request, pk):
    if request.user.role != "student":
        return _role_error("student")
    achievement = get_object_or_404(Achievement, pk=pk, student=request.user)

    if request.method == "DELETE":
        achievement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = AchievementWriteSerializer(achievement, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(AchievementSerializer(achievement, context={"request": request}).data)


# ---------------------------------------------------------------------------
# Bookmarks
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bookmark_list_view(request):
    ids = list(Bookmark.objects.filter(student=request.user).values_list("event_id", flat=True))
    return Response({"event_ids": ids})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bookmark_toggle_view(request, event_id):
    event = get_object_or_404(Event, pk=event_id)
    existing = Bookmark.objects.filter(student=request.user, event=event).first()
    if existing:
        existing.delete()
        return Response({"bookmarked": False})
    Bookmark.objects.create(student=request.user, event=event)
    return Response({"bookmarked": True})


# ---------------------------------------------------------------------------
# My registrations (used to show receipts / "already registered" state)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_registrations_view(request):
    if request.user.role != "student":
        return _role_error("student")
    items = Registration.objects.filter(student=request.user)
    return Response(RegistrationSerializer(items, many=True).data)
