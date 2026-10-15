FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer python3-uno fonts-noto-cjk ca-certificates && mkdir -p /opt/legacy && dpkg-query -W -f='${Package}=${Version}\n' > /opt/legacy/versions.txt && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin converter
WORKDIR /opt/legacy
COPY --chown=root:root server.py convert.py ./
USER 10001:10001
EXPOSE 4319
ENTRYPOINT ["/usr/bin/python3","/opt/legacy/server.py"]
