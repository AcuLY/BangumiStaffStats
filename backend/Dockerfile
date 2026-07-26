FROM --platform=$BUILDPLATFORM docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS build

ARG TARGETOS
ARG TARGETARCH
ARG SOURCE_DATE_EPOCH=0

ENV CGO_ENABLED=0 \
    GOENV=off \
    GOFLAGS=-mod=readonly \
    GOTOOLCHAIN=local \
    GOWORK=off

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY cmd ./cmd
COPY internal ./internal

RUN GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags="-buildid= -s -w" \
      -o /out/bgmss-api \
      ./cmd/api
RUN GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build \
      -buildvcs=false \
      -trimpath \
      -ldflags="-buildid= -s -w" \
      -o /out/archive-smoke \
      ./cmd/archive-smoke

FROM scratch AS binary

COPY --from=build /out/bgmss-api /bgmss-api
COPY --from=build /out/archive-smoke /archive-smoke

FROM gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6 AS runtime

ARG SOURCE_REVISION
ARG SOURCE_TREE
ARG OPENAPI_SHA256
ARG ARCHIVE_MANIFEST_SCHEMA_SHA256
ARG ARCHIVE_SCHEMA_SQL_SHA256

LABEL org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.bgmss.source-tree="${SOURCE_TREE}" \
      io.bgmss.openapi.sha256="${OPENAPI_SHA256}" \
      io.bgmss.archive-manifest-schema.sha256="${ARCHIVE_MANIFEST_SCHEMA_SHA256}" \
      io.bgmss.archive-schema-sql.sha256="${ARCHIVE_SCHEMA_SQL_SHA256}"

COPY --from=build --chown=65532:65532 /out/bgmss-api /usr/local/bin/bgmss-api

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/bgmss-api"]
