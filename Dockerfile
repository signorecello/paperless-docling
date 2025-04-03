FROM node:18-slim

# Install system dependencies for docling
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN npm i -g bun
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install docling accelerate rapidocr_onnxruntime
# RUN docling-tools models download


# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Create documents directory
RUN mkdir -p documents

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 
