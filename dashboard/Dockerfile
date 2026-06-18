FROM node:20-alpine

WORKDIR /app/dashboard

COPY dashboard/package.json /app/dashboard/package.json
COPY dashboard/src /app/dashboard/src
COPY dashboard/public /app/dashboard/public
COPY dashboard/tsconfig.json /app/dashboard/tsconfig.json

RUN npm install --no-fund --no-audit

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "src/server.ts"]
