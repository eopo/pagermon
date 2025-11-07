FROM node:24

RUN apt update && apt install -y cmake build-essential rtl-sdr
# TODO: Replace with master repository when multimon-ng is merged
RUN git clone https://github.com/eopo/multimon-ng.git && \
    cd multimon-ng && \
    git checkout feat-json-timestamp && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install && \
    ldconfig

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

CMD ["npm", "start"]
