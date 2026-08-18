"""Seeds the database with the same demo accounts and events that used to
live in the frontend's mockData.js, so the app is immediately explorable
after `migrate` with the exact same demo credentials as the old prototype.

Usage: python manage.py seed_data
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import InstituteProfile, StudentProfile, User
from events.models import Event


DEMO_USERS = [
    dict(id="u-100", role="student", name="Priya Nair", email="priya@college.edu",
         password="student123", student_id="STU-2201", affiliation="Sinhagad Institute of Technology"),
    dict(id="u-101", role="student", name="Arjun Mehta", email="arjun@college.edu",
         password="student123", student_id="STU-2242", affiliation="MIT World Peace University"),
    dict(id="u-200", role="institute", name="Dr. Kavita Rao", email="admin@fergusson.edu",
         password="institute123", institution_name="Fergusson College", institution_id="INST-01"),
    dict(id="u-201", role="institute", name="Prof. Samir Deshpande", email="admin@coep.edu",
         password="institute123", institution_name="College of Engineering Pune", institution_id="INST-02"),
]

DEMO_EVENTS = [
    dict(title="Codeverse '26 — Intercollegiate Hackathon", institution="College of Engineering Pune",
         category="Technical", scope="Intercollege", tags=["Hackathon", "48hrs", "Teams of 4"],
         date="2026-08-14", venue="COEP Innovation Hub, Pune", city="Pune",
         description="A 48-hour build sprint for student teams tackling open civic-tech problems. Mentors from local startups drop in throughout.",
         fee=250, seats_left=34, seats_total=200, cover_image_url="https://picsum.photos/seed/codeverse26/640/420"),
    dict(title="Kalaangan — Inter-College Cultural Fest", institution="Fergusson College",
         category="Cultural", scope="Intercollege", tags=["Dance", "Music", "Drama"],
         date="2026-08-22", venue="Fergusson Amphitheatre", city="Pune",
         description="Three days of performances, battle-of-bands, and a street-play competition open to all affiliated colleges.",
         fee=100, seats_left=210, seats_total=600, cover_image_url="https://picsum.photos/seed/kalaangan26/640/420"),
    dict(title="FinLit Bootcamp — Campus Investing 101", institution="MIT World Peace University",
         category="Workshop", scope="Intracollege", tags=["Finance", "Beginner Friendly"],
         date="2026-07-30", venue="MIT-WPU Seminar Hall 3", city="Pune",
         description="A hands-on session on budgeting, SIPs, and reading a balance sheet, run by alumni now working in equity research.",
         fee=0, seats_left=88, seats_total=120, cover_image_url="https://picsum.photos/seed/finlitbootcamp/640/420"),
    dict(title="Smart Sports Meet — Robotics on the Field", institution="College of Engineering Pune",
         category="Technical", scope="Intercollege", tags=["Robotics", "Competition"],
         date="2026-09-05", venue="COEP Sports Complex", city="Pune",
         description="Autonomous-bot obstacle races and a live line-following championship, open to any recognized robotics club.",
         fee=150, seats_left=40, seats_total=150, cover_image_url="https://picsum.photos/seed/smartsportsmeet/640/420"),
    dict(title="Open Mic & Poetry Circle", institution="Fergusson College",
         category="Cultural", scope="Intracollege", tags=["Poetry", "Music", "Free Entry"],
         date="2026-07-18", venue="Fergusson Lawns", city="Pune",
         description="An unplugged evening for spoken word, original verse, and acoustic sets. Sign-up sheet at the venue.",
         fee=0, seats_left=150, seats_total=180, cover_image_url="https://picsum.photos/seed/openmicpoetry/640/420"),
    dict(title="Design Sprint — UX for Bharat", institution="Symbiosis Institute of Technology",
         category="Workshop", scope="Intercollege", tags=["UX", "Figma", "Case Study"],
         date="2026-08-02", venue="Symbiosis Design Lab", city="Mumbai",
         description="Teams redesign a real regional-language product flow in a single day, judged by working product designers.",
         fee=200, seats_left=22, seats_total=60, cover_image_url="https://picsum.photos/seed/designsprintux/640/420"),
    dict(title="Startup Pitch Arena", institution="IIT Bombay Entrepreneurship Cell",
         category="Technical", scope="Intercollege", tags=["Pitching", "Funding", "Networking"],
         date="2026-09-19", venue="IIT Bombay Convention Centre", city="Mumbai",
         description="Ten shortlisted student ventures pitch to a panel of early-stage VCs for seed cheques and mentorship slots.",
         fee=0, seats_left=5, seats_total=300, cover_image_url="https://picsum.photos/seed/startuppitcharena/640/420"),
    dict(title="Classical Rhythms — Inter-University Music Meet", institution="Delhi University",
         category="Cultural", scope="Intercollege", tags=["Classical", "Vocal", "Instrumental"],
         date="2026-08-29", venue="DU North Campus Auditorium", city="Delhi NCR",
         description="A day of Hindustani and Carnatic performances judged by faculty from three affiliated music departments.",
         fee=50, seats_left=96, seats_total=250, cover_image_url="https://picsum.photos/seed/classicalrhythms/640/420"),
]


class Command(BaseCommand):
    help = "Seed the database with UniEvents demo accounts and events."

    @transaction.atomic
    def handle(self, *args, **options):
        created_users = 0
        institute_by_name = {}

        for u in DEMO_USERS:
            user, was_created = User.objects.get_or_create(
                email=u["email"],
                defaults=dict(name=u["name"], role=u["role"], city="Pune"),
            )
            if was_created:
                user.set_password(u["password"])
                user.save(update_fields=["password"])
                created_users += 1

            if u["role"] == "student":
                StudentProfile.objects.get_or_create(
                    user=user,
                    defaults=dict(student_id=u["student_id"], affiliation=u["affiliation"]),
                )
            else:
                InstituteProfile.objects.get_or_create(
                    user=user,
                    defaults=dict(institution_name=u["institution_name"], institution_id=u["institution_id"]),
                )
                institute_by_name[u["institution_name"]] = user

        created_events = 0
        for e in DEMO_EVENTS:
            _, was_created = Event.objects.get_or_create(
                title=e["title"],
                institution=e["institution"],
                defaults=dict(
                    category=e["category"], scope=e["scope"], tags=e["tags"], date=e["date"],
                    venue=e["venue"], city=e["city"], description=e["description"], fee=e["fee"],
                    seats_left=e["seats_left"], seats_total=e["seats_total"],
                    cover_image_url=e["cover_image_url"], status=Event.STATUS_ACTIVE,
                    created_by=institute_by_name.get(e["institution"]),
                ),
            )
            if was_created:
                created_events += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seed complete: {created_users} new users, {created_events} new events "
            f"(totals: {User.objects.count()} users, {Event.objects.count()} events)."
        ))
