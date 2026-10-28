FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public
COPY data ./data
COPY test ./test

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]