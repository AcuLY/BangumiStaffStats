package filter

import (
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func FilterByFavorite(subjects *[]*model.Subject, favoriteRange []*int) error {
	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if favoriteRange[0] != nil && *favoriteRange[0] > s.Favorite {
			continue
		}
		if favoriteRange[1] != nil && *favoriteRange[1] < s.Favorite {
			continue
		}

		subjectsSlice[count] = s
		count++
	}

	*subjects = subjectsSlice[:count]
	return nil
}
