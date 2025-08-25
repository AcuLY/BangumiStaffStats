package logger

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// timeSliceWriter 可以按月份对日志进行分片。
type TimeSlicingWriter struct {
	mu sync.Mutex
	// 正在写入的日期
	date string
	// 文件对象指针
	file *os.File
	// 日志文件路径
	LogPath string
}

// Write 按月份对日志文件分片。
func (w *TimeSlicingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	currentDate := time.Now().Format("2006-01-02")
	if w.file == nil || currentDate != w.date {
		if w.file != nil {
			w.file.Close()
		}

		filePath := w.LogPath + currentDate + ".log"
		file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			fmt.Println("log write error: " + err.Error())
			return 0, err
		}
		w.file = file
		w.date = currentDate
	}

	return w.file.Write(p)
}

var consoleLogger *zap.Logger
var fileLogger *zap.Logger

func Init() error {
	if config.Log == nil {
		return errors.New("log config not initialized")
	}

	err := os.MkdirAll("./logs/app", 0755)
	if err != nil {
		return errors.New("failed to create directory: " + err.Error())
	}
	err = os.MkdirAll("./logs/gin", 0755)
	if err != nil {
		return errors.New("failed to create directory: " + err.Error())
	}
	err = os.MkdirAll("./logs/gorm", 0755)
	if err != nil {
		return errors.New("failed to create directory: " + err.Error())
	}

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.EncodeTime = zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05")

	fileEnc := zapcore.NewJSONEncoder(encCfg)
	writer := &TimeSlicingWriter{
		LogPath: config.Log.AppLogPath,
	}
	fileCore := zapcore.NewCore(fileEnc, zapcore.AddSync(writer), zap.InfoLevel)
	fileLogger = zap.New(fileCore)

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

// callerField 得到 logger.Debug 等方法的调用者的信息
func callerField() zap.Field {
	pc, file, line, ok := runtime.Caller(2)

	if !ok {
		return Field("caller", "unknown")
	}

	fileName := filepath.Base(file)
	funcName := path.Base(runtime.FuncForPC(pc).Name())

	return Field("caller", fmt.Sprintf("%s:%s:%d", funcName, fileName, line))
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
	fields = append(fields, callerField())

	consoleLogger.Warn(msg, fields...)
	fileLogger.Warn(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	fields = append(fields, callerField())

	consoleLogger.Error(msg, fields...)
	fileLogger.Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	fields = append(fields, callerField())

	consoleLogger.Fatal(msg, fields...)
	fileLogger.Fatal(msg, fields...)
}
