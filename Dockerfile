FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p data
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
CMD ["node", "src/boot.js"]
