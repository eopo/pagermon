FROM node:24

# Install build tools and dependencies for RTL-SDR and Multimon-NG
RUN apt update && apt install -y \
    cmake \
    build-essential \
    git \
    rtl-sdr \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Build and install Multimon-NG (includes JSON timestamp support)
# TODO: Replace with master repository when feat-json-timestamp is merged
RUN git clone https://github.com/eopo/multimon-ng.git /tmp/multimon-ng && \
    cd /tmp/multimon-ng && \
    git checkout feat-json-timestamp && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install && \
    ldconfig && \
    rm -rf /tmp/multimon-ng

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci

# Copy application code
COPY . .

# Health check - test the health endpoint on port 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "index.js"]
