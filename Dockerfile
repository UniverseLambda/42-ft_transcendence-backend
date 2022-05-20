FROM node:latest

WORKDIR /data

ARG NPM_TOKEN

# COPY .npmrc .npmrc
COPY package.json package.json
# Installing code
COPY . /data

RUN npm install \
	&& rm -f .npmrc \
	&& npm install webpack --legacy-peer-deps

# CMD npm start
CMD ["/bin/bash", "./start.sh"]
