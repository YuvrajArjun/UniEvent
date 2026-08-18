from django.shortcuts import get_object_or_404, render
from events.models import Registration


def index(request):
    return render(request, "index.html")


def about(request):
    return render(request, "about.html")


def achievements(request):
    return render(request, "achievements.html")


def conduct_event(request):
    return render(request, "conduct-event.html")


def dashboard(request):
    return render(request, "dashboard.html")


def not_found(request, *args, **kwargs):
    return render(request, "404.html", status=404)


def verify_ticket(request, transaction_hash):
    registration = get_object_or_404(
        Registration.objects.select_related("event", "student"),
        transaction_hash=transaction_hash
    )
    return render(request, "verify_ticket.html", {
        "registration": registration,
        "event": registration.event
    })


def scan_ticket(request):
    return render(request, "scan_ticket.html")


def control_panel(request):
    return render(request, "control_panel.html")


