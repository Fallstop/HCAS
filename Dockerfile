FROM node:alpine

WORKDIR /usr/src/qrls

COPY package*.json ./

RUN yarn install

# FOR PRODUCTION
# RUN npm install --only=production

COPY . .

# Timezone
RUN apk add --no-cache tzdata
ENV TZ Pacific/Auckland

# APPLICATION PORT
EXPOSE 8080
ENV PORT 8080

CMD ["node", "./bin/www"]
