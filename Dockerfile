FROM satantime/puppeteer-node:20.9.0-bookworm

# Create app directory
WORKDIR /app

# Copy package files
COPY package*json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Build the app using the production build script
RUN npm run build:docker

# Command to run the app
CMD ["npm", "start"] 