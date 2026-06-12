FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY app ./app
COPY data ./data
COPY tools ./tools
COPY vendor ./vendor
RUN rm -rf vendor/madden-franchise/node_modules \
    && npm --prefix vendor/madden-franchise ci --omit=dev
RUN mkdir -p ./data/sessions

ENV PORT=8080

CMD ["sh", "-c", "python3 -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
