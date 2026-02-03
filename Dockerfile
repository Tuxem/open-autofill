FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source files
COPY tailwind.config.js ./
COPY src/ ./src/

# Build CSS
RUN npm run build:css

# Output stage - just the built extension files
FROM scratch AS export
COPY --from=builder /app/src/ui/styles/output.css /src/ui/styles/output.css
