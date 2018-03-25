FROM jaredallard/triton-base:latest

COPY --chown=999:999 package.json /stack
RUN yarn

COPY --chown=999:999 . /stack