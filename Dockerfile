FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src ./src
COPY data ./data
RUN npm run build
CMD ["npm", "start"]
