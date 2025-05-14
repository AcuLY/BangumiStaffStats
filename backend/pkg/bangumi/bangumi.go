// bangumi 封装了 Bangumi API 中获取用户收藏的方法
package bangumi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/pkg/httpclient"
	"golang.org/x/sync/errgroup"
)

// ErrInvalidUserID 表示非法用户名
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

// Collection 匹配 Bangumi collection API 返回的 JSON 结构
type Collection struct {
	UpdatedAt time.Time `json:"updated_at"`
	Comment   string    `json:"comment"`
	Tags      []string  `json:"tags"`
	Subject   struct {
		Date   string `json:"date"`
		Images struct {
			Small  string `json:"small"`
			Grid   string `json:"grid"`
			Large  string `json:"large"`
			Medium string `json:"medium"`
			Common string `json:"common"`
		} `json:"images"`
		Name         string `json:"name"`
		NameCn       string `json:"name_cn"`
		ShortSummary string `json:"short_summary"`
		Tags         []struct {
			Name      string `json:"name"`
			Count     int    `json:"count"`
			TotalCont int    `json:"total_cont"`
		} `json:"tags"`
		Score           float64 `json:"score"`
		Type            int     `json:"type"`
		ID              int     `json:"id"`
		Eps             int     `json:"eps"`
		Volumes         int     `json:"volumes"`
		CollectionTotal int     `json:"collection_total"`
		Rank            int     `json:"rank"`
	} `json:"subject"`
	SubjectID   int  `json:"subject_id"`
	VolStatus   int  `json:"vol_status"`
	EpStatus    int  `json:"ep_status"`
	SubjectType int  `json:"subject_type"`
	Type        int  `json:"type"`
	Rate        int  `json:"rate"`
	Private     bool `json:"private"`
}

// userCollectionURL 根据 userID 返回 Bangumi API 需要的 URL
func userCollectionURL(userID string) string {
	return fmt.Sprintf("https://api.bgm.tv/v0/users/%s/collections", userID)
}

// userCollectionParams 根据传入的参数返回一个 GET 请求所需的 map
func userCollectionParams(cq CollectionQuery, limit int, offset int) map[string][]string {
	return map[string][]string{
		"subject_type": {strconv.Itoa(cq.SubjectType)},
		"type":         {strconv.Itoa(cq.CollectionType)},
		"limit":        {strconv.Itoa(limit)},
		"offset":       {strconv.Itoa(offset)},
	}
}

// FetchCollectionsByType 获取用户某一类型的所有收藏。
func FetchCollectionsByType(ctx context.Context, cq CollectionQuery) ([]*Collection, error) {
	collectionCount, err := fetchCollectionCountByType(ctx, cq)
	if err != nil {
		return nil, err
	}

	collections := make([]*Collection, 0, collectionCount)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for offset := 0; offset < int(collectionCount); offset += collectionPageSize {
		g.Go(func() error {
			collectionByPage, err := fetchSinglePage(ctx, cq, offset)
			if err != nil {
				return err
			}

			mu.Lock()
			collections = append(collections, collectionByPage...)
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return collections, nil
}

// fetchSinglePage 获取用户一页的某一类收藏
func fetchSinglePage(ctx context.Context, cq CollectionQuery, offset int) ([]*Collection, error) {
	baseURL := userCollectionURL(cq.UserID)
	params := userCollectionParams(cq, collectionPageSize, offset)

	resp, err := httpclient.HTTPGet(ctx, baseURL, params)
	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	type collectionResponse struct {
		CollectionsByPage []*Collection `json:"data"`
	}

	var cr collectionResponse
	if err := json.Unmarshal(body, &cr); err != nil {
		return nil, err
	}

	return cr.CollectionsByPage, nil
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
