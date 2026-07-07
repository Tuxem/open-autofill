FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build CSS and browser packages.
# BROWSERSLIST_IGNORE_OLD_DATA silences the stale caniuse-lite warning from
# tailwindcss 3.x, which bundles its own peers/index.js and cannot be refreshed
# without upgrading to tailwind 4.x.
ENV BROWSERSLIST_IGNORE_OLD_DATA=1
RUN npm run build

# Export stage
FROM scratch AS export
COPY --from=builder /app/dist /dist
