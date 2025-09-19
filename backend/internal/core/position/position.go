package position

import (
	"encoding/json"
	"os"
)

// 最外层下标：1书籍 2动画 3游戏 4音乐 6三次元
var positionIDs []map[string]int

func Init(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	if err := json.NewDecoder(file).Decode(&positionIDs); err != nil {
		return err
	}

	return nil
}

func PositionID(subjectType int, position string) int {
	return positionIDs[subjectType][position]
}
