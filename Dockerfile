FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV FLUENT_OSS_HOST=0.0.0.0
ENV FLUENT_OSS_PORT=8788
ENV FLUENT_OSS_ROOT=/var/lib/fluent

EXPOSE 8788

CMD ["sh", "-lc", "npm run oss:start -- --host \"$FLUENT_OSS_HOST\" --port \"$FLUENT_OSS_PORT\" --root \"$FLUENT_OSS_ROOT\""]
