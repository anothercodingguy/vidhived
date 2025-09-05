import multiprocessing
import os

bind = os.getenv("BIND", "0.0.0.0:%s" % os.getenv("PORT", "8080"))
workers = int(os.getenv("WEB_CONCURRENCY", str(multiprocessing.cpu_count() * 2 + 1)))
threads = int(os.getenv("GUNICORN_THREADS", "4"))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")

# Keep-alive and timeouts suitable for cloud
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "15"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))

# App module
wsgi_app = os.getenv("GUNICORN_APP", "wsgi:application")
