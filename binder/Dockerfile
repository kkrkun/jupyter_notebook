FROM jupyter/base-notebook:latest

USER root

RUN apt-get update && \
    apt-get install -y sshpass && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

USER $NB_UID
