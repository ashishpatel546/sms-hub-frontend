FROM node:20-alpine

WORKDIR /app/hub-frontend

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Overwrite .env with docker-specific values BEFORE build
# NEXT_PUBLIC_* vars are baked into the bundle at build time
RUN cp .env.docker .env

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
