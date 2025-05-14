// bangumi 封装了 Bangumi API 中获取用户收藏的方法
package bangumi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
)

var ErrInvalidUserID error = errors.New("invalid userID")

// Bangumi API /v0/users/{username}/collections 的最大分页值（limit）
const collectionPageSize = 50

// CollectionQuery 定义调用 Bangumi API 的用户收藏时需要的参数。
type CollectionQuery struct {
	// 用户 UID（若用户修改过 UID 则不能使用原本的数字 UID）
	UserID string
	// 1 书籍 2 动画 3 游戏 4 音乐 6 三次元
	SubjectType int
	// 1 想看 2 看过 3 在看 4 搁置 5 抛弃
	CollectionType int
}

func userCollectionURL(userID string) string {
	return "https://api.bgm.tv/v0/users/" + userID + "/collections"
}

func userCollectionParams(cq CollectionQuery, limit int, offset int) map[string][]string {
	return map[string][]string{
		"subject_type": {strconv.Itoa(cq.SubjectType)},
		"type":         {strconv.Itoa(cq.CollectionType)},
		"limit":        {strconv.Itoa(limit)},
		"offset":       {strconv.Itoa(offset)},
	}
}

// GetCollectionsByType 获取用户某一类型的所有收藏。
//
// 返回值为填充了 ID 、Image 和 UserRate 字段的 Subject 列表。
func GetCollectionsByType(ctx context.Context, cq CollectionQuery) ([]*model.Subject, error) {
	collectionCount, err := fetchCollectionCountByType(ctx, cq)
	if err != nil {
		return nil, err
	}

	var wg sync.WaitGroup
	baseURL := userCollectionURL(cq.UserID)
	results := make(chan *model.Subject, int(collectionCount))

	for offset := 0; offset < int(collectionCount); offset += collectionPageSize {
		wg.Add(1)

		go func() {
			defer wg.Done()
			if err := ctx.Err(); err != nil {
				return
			}

			params := userCollectionParams(cq, collectionPageSize, offset)
			resp, err := httpclient.HTTPGet(ctx, baseURL, params)
			if err != nil {
				return
			}

			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return
			}

			subjects, err := parseUserCollectionResponse(body)
			if err != nil {
				logger.Error("Failed to parse bangumi response JSON.", logger.Field("body", body))
				return
			}

			for _, s := range subjects {
				if err := ctx.Err(); err != nil {
					return
				}

				results <- s
			}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	collections := make([]*model.Subject, 0)
	for res := range results {
		collections = append(collections, res)
	}

	return collections, nil
}

// fetchCollectionCountByType 获取用户某一类收藏的数量。
func fetchCollectionCountByType(ctx context.Context, cq CollectionQuery) (int, error) {
	baseURL := userCollectionURL(cq.UserID)
	params := userCollectionParams(cq, 1, 0)

	resp, err := httpclient.HTTPGet(ctx, baseURL, params)
	if err != nil {
		return 0, err
	}
	if resp.StatusCode == 404 {
		return 0, ErrInvalidUserID
	}

	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	type response struct {
		Total int `json:"total"`
	}
	var r response
	json.Unmarshal(body, &r)

	return r.Total, nil
}

// parseUserCollectionResponse 将 Bangumi API 的响应体解析为 Subject 列表
func parseUserCollectionResponse(body []byte) ([]*model.Subject, error) {
	type fetchedSubject struct {
		SubjectID int     `json:"subject_id"`
		UserRate      float32 `json:"rate"`
	}
	type response struct {
		Data []fetchedSubject `json:"data"`
	}

	var resp response

	err := json.Unmarshal(body, &resp)
	if err != nil {
		return nil, err
	}

	subjects := make([]*model.Subject, 0, len(resp.Data))
	for _, d := range resp.Data {
		s := &model.Subject{ID: d.SubjectID, UserRate: &d.UserRate} // 这里填充的是 UserRate
		subjects = append(subjects, s)
	}

	return subjects, nil
}
