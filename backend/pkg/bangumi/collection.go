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

	"github.com/AcuLY/BangumiStaffStats/backend/pkg/httpclient"
	"golang.org/x/sync/errgroup"
)

// ErrInvalidUserID 表示非法用户名
var ErrInvalidUserID error = errors.New("invalid userID")

// Bangumi API /v0/users/{username}/collections 的最大分页值（limit）
const pageSize = 50

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

// response 对应 Bangumi API collection 请求的响应字段
type response struct {
	Data  []*Collection `json:"data"`
	Total int           `json:"total"`
}

// url 根据 userID 返回 Bangumi API 需要的 URL
func url(userID string) string {
	return fmt.Sprintf("https://api.bgm.tv/v0/users/%s/collections", userID)
}

// params 创建 GET 请求所需的查询参数 map
func params(q CollectionQuery, limit int, offset int) map[string][]string {
	return map[string][]string{
		"subject_type": {strconv.Itoa(q.SubjectType)},
		"type":         {strconv.Itoa(q.CollectionType)},
		"limit":        {strconv.Itoa(limit)},
		"offset":       {strconv.Itoa(offset)},
	}
}

// FetchCollections 获取用户某一类型的所有收藏。
func FetchCollections(ctx context.Context, q CollectionQuery) ([]*Collection, error) {
	count, err := fetchCount(ctx, q)
	if err != nil {
		return nil, err
	}

	collections := make([]*Collection, 0, count)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for offset := 0; offset < int(count); offset += pageSize {
		g.Go(func() error {
			page, err := fetchSinglePage(ctx, q, offset)
			if err != nil {
				return err
			}

			mu.Lock()
			collections = append(collections, page...)
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
func fetchSinglePage(ctx context.Context, q CollectionQuery, offset int) ([]*Collection, error) {
	baseURL := url(q.UserID)
	params := params(q, pageSize, offset)

	resp, err := httpclient.GET(ctx, baseURL, params)
	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	page := new(response)
	if err := json.Unmarshal(body, page); err != nil {
		return nil, err
	}

	return page.Data, nil
}

// fetchCount 获取用户某一类收藏的数量。
func fetchCount(ctx context.Context, q CollectionQuery) (int, error) {
	baseURL := url(q.UserID)
	params := params(q, 1, 0) // 只查一个条目，返回值带有收藏数量

	resp, err := httpclient.GET(ctx, baseURL, params)
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

	count := new(response)
	json.Unmarshal(body, count)

	return count.Total, nil
}
