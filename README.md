# UniEvents — Full-Stack Edition

UniEvents is a campus event discovery & management platform. This is a complete rebuild of the original
static HTML/CSS/JS prototype into a full-stack application:

- **Frontend:** HTML, CSS, JavaScript (redesigned, fully responsive) — served as Django templates + static files
- **Backend:** Python (Django + Django REST Framework)
- **Database:** MySQL 8 (via Docker)

Every feature from the original frontend prototype (event discovery/filtering, registration + simulated
checkout/receipt, student event proposals with an institution approval → token → publish lifecycle, the
institute Administration Hub, the personal Achievements Locker, and bookmarks) is preserved and now runs
against real persistence instead of mock data / `localStorage`.

## Project layout

```
UniEventsF/
├── unievents_project/   # Django settings, root urls.py
├── accounts/            # Custom User model, Student/Institute profiles, auth API
├── events/              # Event, Proposal, Registration, Achievement, Bookmark models + REST API
├── core/                 # Page views (renders the Django templates)
├── templates/            # base.html + one template per page
├── static/
│   ├── css/styles.css    # Redesigned design system (maroon/gold/cream brand, fully responsive)
│   ├── js/                # api.js (REST client), utils.js, nav.js, events.js, dashboard.js,
│   │                      # conduct.js, achievements.js, effects.js
│   └── assets/            # Brand logos (carried over from the original prototype)
├── docker-compose.yml     # MySQL 8 container definition
├── requirements.txt
├── .env.example
└── UniEventsF_legacy_frontend/   # untouched copy of the original static prototype, kept for reference
```

## Prerequisites

- Python 3.11+ (tested with 3.13)
- Docker Desktop (for the MySQL container) — or any MySQL 8 server you already have
- pip

## Setup

From the `UniEventsF` project root (the folder containing `manage.py`):

```powershell
# 1. Create and activate a virtual environment
python -m venv unievents-venv
.\unievents-venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start MySQL (runs on host port 3307 to avoid clashing with any local MySQL install)
docker compose up -d

# 4. (Optional) copy .env.example to .env if you want to override any settings
copy .env.example .env

# 5. Apply migrations
python manage.py migrate

# 6. Seed demo data (same accounts/events as the original prototype)
python manage.py seed_data

# 7. (Optional) create a superuser for /admin/
python manage.py createsuperuser

# 8. Run the server
python manage.py runserver
```

Then open **http://127.0.0.1:8000/**.

## Demo credentials

Seeded by `manage.py seed_data` (also shown in the app's login modal as a hint):

| Role      | Email                  | Password      |
|-----------|------------------------|---------------|
| Student   | priya@college.edu      | student123    |
| Student   | arjun@college.edu      | student123    |
| Institute | admin@fergusson.edu    | institute123  |
| Institute | admin@coep.edu         | institute123  |

You can also register new accounts directly from the "Create an account" link in the login modal.

## How the pieces fit together

- Django serves the HTML pages (`/`, `/about/`, `/achievements/`, `/conduct-event/`, `/dashboard/`) as
  server-rendered templates, and everything dynamic on those pages is fetched client-side from a JSON REST
  API under `/api/...` (see `events/urls.py` and `accounts/urls.py`).
- Authentication uses DRF token auth: after login/register, the frontend stores `{ token, user }` in
  `localStorage` (`static/js/api.js`) and sends `Authorization: Token <key>` on subsequent requests.
- The original mock dataset (`mockData.js`) is now real MySQL data, loaded once via
  `python manage.py seed_data` (`events/management/commands/seed_data.py`).
- Uploaded images (achievement certificates, event cover photos) are stored under `media/` via Django's
  `ImageField` + Pillow.

## Key API endpoints

| Endpoint | Description |
|---|---|
| `POST /api/auth/register/`, `/login/`, `/logout/`, `GET /me/` | Auth |
| `GET /api/events/?city=&category=&scope=&q=&sort=` | Event feed with filters |
| `POST /api/events/<id>/register/` | Register for an event (computes GST + receipt) |
| `GET/POST /api/proposals/` | List / submit event proposals |
| `POST /api/proposals/<id>/approve\|reject\|publish/` | Institution review + publish lifecycle |
| `POST /api/proposals/validate-token/` | Institute "listing portal" token lookup |
| `GET /api/dashboard/stats/`, `/institute/events/` | Institute Administration Hub data |
| `GET/POST/PUT/DELETE /api/achievements/` | Achievements locker (multipart image upload) |
| `GET /api/bookmarks/`, `POST /api/bookmarks/<event_id>/toggle/` | Bookmarks |
| `GET /api/meta/` | Categories / scopes / city list |

## Notes

- `DEBUG=True` and permissive `ALLOWED_HOSTS`/CORS are configured for local development. Tighten these
  (via `.env`) before deploying anywhere public.
- The MySQL container persists data in a named Docker volume (`unievents_mysql_data`), so `docker compose
  down` (without `-v`) keeps your data across restarts.
- The original static prototype is preserved untouched in `UniEventsF_legacy_frontend/` for reference/comparison.
