from app import app as application

# Gunicorn will look for `application` by default.
# To run locally: `gunicorn -w 2 -b 0.0.0.0:8080 wsgi:application`
