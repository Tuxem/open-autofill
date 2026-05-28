FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build CSS and browser packages
RUN npm run build

# Export stage
FROM scratch AS export
COPY --from=builder /app/dist /dist
