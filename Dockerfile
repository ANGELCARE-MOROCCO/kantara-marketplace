FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./

# Skip Prisma generate during build
ENV SKIP_PRISMA_GENERATE=true

RUN npm install

COPY . .

# Reset ENV for runtime (so prisma generate works automatically later if needed)
ENV SKIP_PRISMA_GENERATE=false

EXPOSE 3000

CMD ["npm", "run", "dev"]
