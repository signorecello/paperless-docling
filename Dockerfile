FROM node:18-slim

# Install system dependencies for docling
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install docling
RUN pip3 install docling

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
