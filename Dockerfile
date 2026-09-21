FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY deployforge-strategy-manifest.json /usr/share/nginx/html/deployforge-strategy-manifest.json

EXPOSE 80
