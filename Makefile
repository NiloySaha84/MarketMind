# Docker Hub images + swarm deploy helpers.
#   make build-push
#   make swarm-release          # build, push, deploy to oracle-vm

DOCKER_USER ?= niloysaha5335
VERSION ?= $(if $(N),0.0.$(N),latest)
# VM is amd64 — cross-build from Apple Silicon
DOCKER_PLATFORM ?= linux/amd64

IMAGE_PREFIX := $(if $(DOCKER_USER),$(DOCKER_USER)/,)

API_IMAGE := $(IMAGE_PREFIX)marketmind-api-image
DISPATCHER_IMAGE := $(IMAGE_PREFIX)marketmind-dispatcher-image
WORKER_IMAGE := $(IMAGE_PREFIX)marketmind-worker-image
FRONTEND_IMAGE := $(IMAGE_PREFIX)marketmind-frontend-image

# Don't let DOCKER_HOST=ssh://… in the shell hijack local builds
LOCAL_DOCKER := env -u DOCKER_HOST
DOCKER_BUILD := $(LOCAL_DOCKER) docker build --platform $(DOCKER_PLATFORM)
COMPOSE_SWARM := $(LOCAL_DOCKER) docker compose -f docker-swarm.yml

DOCKER_HOST ?= ssh://oracle-vm
STACK_NAME := marketmind
ENV_FILE := .env.production.local
SECRETS_DIR := .swarm-secrets
PREPARE_SECRETS := ./scripts/prepare-swarm-secrets.sh

.PHONY: build push build-push build-backend push-backend build-frontend push-frontend \
	build-N push-N check-docker-user check-docker-login \
	swarm-secrets-prepare swarm-up swarm-down swarm-pull swarm-up-remote \
	swarm-init swarm-deploy-stack swarm-release swarm-ls swarm-ps swarm-services swarm-rm

check-docker-user:
	@test -n '$(DOCKER_USER)' || (echo 'Set DOCKER_USER, e.g. make build-push DOCKER_USER=myuser' >&2; exit 1)

check-docker-login: check-docker-user
	@$(LOCAL_DOCKER) docker login --help >/dev/null 2>&1 || true
	@grep -q '"https://index.docker.io/v1/"' $$HOME/.docker/config.json 2>/dev/null || \
		(echo 'Run: docker login -u $(DOCKER_USER)' >&2; exit 1)

build: build-backend build-frontend

push: check-docker-login push-backend push-frontend

build-push: build push

build-backend:
	$(DOCKER_BUILD) -t $(API_IMAGE):$(VERSION) -f Dockerfile .
	$(LOCAL_DOCKER) docker tag $(API_IMAGE):$(VERSION) $(DISPATCHER_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker tag $(API_IMAGE):$(VERSION) $(WORKER_IMAGE):$(VERSION)

push-backend: check-docker-login
	$(LOCAL_DOCKER) docker push $(API_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker push $(DISPATCHER_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker push $(WORKER_IMAGE):$(VERSION)

build-frontend:
	$(DOCKER_BUILD) -t $(FRONTEND_IMAGE):$(VERSION) -f frontend/Dockerfile ./frontend

push-frontend: check-docker-login
	$(LOCAL_DOCKER) docker push $(FRONTEND_IMAGE):$(VERSION)

build-N: build-backend build-frontend
push-N: push-backend push-frontend

swarm-secrets-prepare:
	@test -f $(ENV_FILE) || (echo 'Missing $(ENV_FILE)' >&2; exit 1)
	@chmod +x $(PREPARE_SECRETS)
	@$(PREPARE_SECRETS) $(ENV_FILE) $(SECRETS_DIR)

swarm-up: swarm-secrets-prepare build
	IMAGE_PREFIX=$(IMAGE_PREFIX) IMAGE_VERSION=$(VERSION) $(COMPOSE_SWARM) up -d

swarm-down:
	IMAGE_PREFIX=$(IMAGE_PREFIX) IMAGE_VERSION=$(VERSION) $(COMPOSE_SWARM) down

swarm-pull: check-docker-user
	$(LOCAL_DOCKER) docker pull $(API_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker pull $(DISPATCHER_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker pull $(WORKER_IMAGE):$(VERSION)
	$(LOCAL_DOCKER) docker pull $(FRONTEND_IMAGE):$(VERSION)

swarm-up-remote: swarm-secrets-prepare swarm-pull
	IMAGE_PREFIX=$(IMAGE_PREFIX) IMAGE_VERSION=$(VERSION) $(COMPOSE_SWARM) up -d

swarm-init:
	DOCKER_HOST=$(DOCKER_HOST) docker swarm init

swarm-deploy-stack: check-docker-user swarm-secrets-prepare
	IMAGE_PREFIX=$(IMAGE_PREFIX) IMAGE_VERSION=$(VERSION) \
		DOCKER_HOST=$(DOCKER_HOST) \
		docker stack deploy --with-registry-auth --detach=false -c docker-swarm.yml $(STACK_NAME)

swarm-release: build-push swarm-deploy-stack

swarm-ls:
	DOCKER_HOST=$(DOCKER_HOST) docker stack ls

swarm-ps:
	DOCKER_HOST=$(DOCKER_HOST) docker stack ps $(STACK_NAME)

swarm-services:
	DOCKER_HOST=$(DOCKER_HOST) docker stack services $(STACK_NAME)

swarm-rm:
	DOCKER_HOST=$(DOCKER_HOST) docker stack rm $(STACK_NAME)
