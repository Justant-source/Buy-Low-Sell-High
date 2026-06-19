FROM node:20-alpine

WORKDIR /app/dashboard

COPY dashboard/package.json /app/dashboard/package.json
COPY dashboard/src /app/dashboard/src
COPY dashboard/public /app/dashboard/public
COPY dashboard/tsconfig.json /app/dashboard/tsconfig.json
COPY engine /app/engine
COPY configs /app/configs
COPY data /app/data

RUN npm install --no-fund --no-audit
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]
