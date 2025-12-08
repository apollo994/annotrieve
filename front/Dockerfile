FROM node:22-alpine AS builder

WORKDIR /app
COPY . .
RUN npm install --legacy-peer-deps
RUN npm run build


FROM nginx:stable-alpine

# Copy frontend build
COPY --from=builder /app/out /usr/share/nginx/html/annotrieve

# Copy nginx config
COPY subpath.template /etc/nginx/templates/default.conf.template

# Create log directory (shared with log reader container via volume)
RUN mkdir -p /var/log/nginx && \
    touch /var/log/nginx/api.log && \
    touch /var/log/nginx/download.log && \
    touch /var/log/nginx/front.log && \
    touch /var/log/nginx/error.log && \
    chmod 666 /var/log/nginx/api.log && \
    chmod 666 /var/log/nginx/download.log && \
    chmod 666 /var/log/nginx/front.log && \
    chmod 666 /var/log/nginx/error.log

CMD ["nginx", "-g", "daemon off;"]