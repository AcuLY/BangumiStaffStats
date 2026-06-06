package position

import (
	"encoding/json"
	"os"
	"strconv"
)

// 最外层下标：1书籍 2动画 3游戏 4音乐 6三次元
var positionIDs []map[string]int
var positionNames map[int]string

func Init(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	if err := json.NewDecoder(file).Decode(&positionIDs); err != nil {
		return err
	}

	positionNames = make(map[int]string)
	for _, positions := range positionIDs {
		for name, id := range positions {
			if _, exists := positionNames[id]; !exists {
				positionNames[id] = name
			}
		}
	}

	return nil
}

func PositionID(subjectType int, position string) int {
	return positionIDs[subjectType][position]
}

func PositionName(id int) string {
	if name, exists := positionNames[id]; exists {
		return name
	}
	return strconv.Itoa(id)
}
