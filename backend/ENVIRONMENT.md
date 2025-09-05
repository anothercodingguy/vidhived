# Backend environment setup

- Copy `.env.example` to `.env` and fill in values.
- Ensure your Google service account key file path is set via `GOOGLE_APPLICATION_CREDENTIALS`.
- Avoid committing `.env` or keys to version control.

## Quick start

```
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: . .venv/Scripts/Activate.ps1
pip install -r requirements.txt
cp .env.example .env  # or create .env manually
flask --app app.py run
```
