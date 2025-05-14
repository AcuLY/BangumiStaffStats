package logger

import (
	"errors"
	"os"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// timeSliceWriter 可以按月份对日志进行分片。
type timeSlicingWriter struct {
	mu sync.Mutex
	// 正在写入的月份
	month string
	// 文件对象指针
	file *os.File
	// 日志文件路径
	logPath string
}

// Write 按月份对日志文件分片。
func (w *timeSlicingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	currentMonth := time.Now().Format("2006-01")
	if w.file == nil || currentMonth != w.month {
		if w.file != nil {
			w.file.Close()
		}

		filePath := w.logPath + currentMonth + ".log"
		file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return 0, err
		}
		w.file = file
		w.month = currentMonth
	}

	return w.file.Write(p)
}

var consoleLogger *zap.Logger
var fileLogger *zap.Logger

func Init() error {
	if config.Log == nil {
		return errors.New("log config not initialized")
	}

	err := os.MkdirAll("./logs", 0755)
	if err != nil {
		return errors.New("failed to create directory: " + err.Error())
	}

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.EncodeTime = zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05")

	fileEnc := zapcore.NewJSONEncoder(encCfg)
	writer := &timeSlicingWriter{
		logPath: config.Log.LogPath,
	}
	fileCore := zapcore.NewCore(fileEnc, zapcore.AddSync(writer), zap.InfoLevel)
	fileLogger = zap.New(fileCore, zap.AddCaller())

	encCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
	consoleEnc := zapcore.NewConsoleEncoder(encCfg)
	consoleCore := zapcore.NewCore(consoleEnc, zapcore.AddSync(os.Stdout), zap.DebugLevel)
	consoleLogger = zap.New(consoleCore)

	return nil
}

// Field 创建一个新的 zap.Field。
func Field(key string, value any) zap.Field {
	return zap.Any(key, value)
}

func Debug(msg string, fields ...zap.Field) {
	consoleLogger.Debug(msg, fields...)
	fileLogger.Debug(msg, fields...)
}

func Info(msg string, fields ...zap.Field) {
	consoleLogger.Info(msg, fields...)
	fileLogger.Info(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	consoleLogger.Warn(msg, fields...)
	fileLogger.Warn(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	consoleLogger.Error(msg, fields...)
	fileLogger.Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	consoleLogger.Fatal(msg, fields...)
	fileLogger.Fatal(msg, fields...)
}
