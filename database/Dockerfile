# syntax=docker/dockerfile:1.4

# ---------------------------------------------------------------------------
# ShaMart database — standalone MySQL container
#
# Runs MySQL in its OWN container, separate from the backend. The backend's
# `database/` Python package connects to it over mysql+pymysql://.
#
# Build with the database/ folder as context:
#
#     docker build -f database/Dockerfile -t shamart-db database/
#     docker run -d --name shamart-db \
#       -p 3306:3306 \
#       -e MYSQL_ROOT_PASSWORD=rootpass \
#       -e MYSQL_DATABASE=cloudmart_db \
#       -e MYSQL_USER=cloudmart_user \
#       -e MYSQL_PASSWORD=secretpass \
#       -v shamart-db-data:/var/lib/mysql \
#       shamart-db
#
# The mysql image initializes the database and application user from the
# MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD environment variables. Table
# DDL is created by the backend via SQLAlchemy init_db().
# ---------------------------------------------------------------------------

# mysql:8.4 is the current LTS line; the PyMySQL backend supports it.
FROM mysql:8.4

EXPOSE 3306

# Healthcheck: reports healthy once MySQL accepts connections.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD mysqladmin ping -h127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --connect-timeout=5

# Default CMD inherited from the base image (mysqld).