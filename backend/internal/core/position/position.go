package position

import (
	"encoding/json"
	"errors"
	"os"
	"strconv"
)

// 最外层下标：1书籍 2动画 3游戏 4音乐 6三次元
var positionID []map[string]int

var validSubjectTypes = map[int]struct{}{1: {}, 2: {}, 3: {}, 4: {}, 6: {}}

func Init() error {
	file, err := os.Open("../../../config/position.json")
	if err != nil {
		return err
	}
	defer file.Close()

	if err := json.NewDecoder(file).Decode(&positionID); err != nil {
		return err
	}

	return nil
}

// PositionIDs 根据条目类型和职位名获取职位的 ID
func PositionID(subjectType int, position string) (int, error) {
	if _, exists := validSubjectTypes[subjectType]; !exists {
		return 0, errors.New("invalid subject type: " + strconv.Itoa(subjectType))
	}

	id, ok := positionID[subjectType][position]
	if !ok {
		return 0, errors.New("invalid position: " + position)
	}

	return id, nil
}
