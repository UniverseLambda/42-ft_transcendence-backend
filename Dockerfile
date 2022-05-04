FROM node:latest

WORKDIR /data

ARG NPM_TOKEN  
# COPY .npmrc .npmrc
COPY package.json package.json  
RUN npm install  
RUN rm -f .npmrc

# Installing code
COPY . /data

CMD npm start
