# ---------- 构建 ----------
FROM golang:1.24-alpine AS builder

ENV GOPROXY=https://goproxy.cn

RUN echo "https://mirrors.aliyun.com/alpine/v3.18/main" > /etc/apk/repositories && \
    echo "https://mirrors.aliyun.com/alpine/v3.18/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache tzdata

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o app ./cmd

# ---------- 运行 ----------
FROM alpine:3.21

RUN echo "https://mirrors.aliyun.com/alpine/v3.21/main" > /etc/apk/repositories && \
    echo "https://mirrors.aliyun.com/alpine/v3.21/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache tzdata

ENV TZ=Asia/Shanghai

WORKDIR /app

COPY --from=builder /app/app .

EXPOSE 5000

CMD ["./app"]
