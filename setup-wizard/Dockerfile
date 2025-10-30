FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for setup wizard
COPY package*.json ./
RUN npm ci --production

# Copy setup wizard files
COPY . .

# Expose setup wizard port
EXPOSE 12006

# Start setup wizard
CMD ["node", "server.js"]
