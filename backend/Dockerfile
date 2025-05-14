FROM golang:1.24-alpine AS builder

ENV GOPROXY=https://goproxy.cn

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o app ./cmd

FROM alpine:3.21

WORKDIR /app

COPY --from=builder /app/app .
COPY config.toml /app/config.toml

EXPOSE 5000

CMD ["./app"]
