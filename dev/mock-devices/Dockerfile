FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ src/

# Device profiles are mounted at runtime via Docker volume
# Expected at /config/device-profiles/

CMD ["npx", "tsx", "src/index.ts"]
