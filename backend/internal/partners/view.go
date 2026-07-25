package partners

import (
	"context"
	"errors"
	"math"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Project derives complete-set leaders and ranks before applying search/page.
// It never mutates the cached core.
func Project(ctx context.Context, core Core, view View) (Page, error) {
	if err := contextError(ctx); err != nil {
		return Page{}, err
	}
	if err := validateView(core.Scope, view); err != nil {
		return Page{}, err
	}
	if err := validateCore(core); err != nil {
		return Page{}, err
	}
	view.Search = normalizeSearch(view.Search)

	rows := make(map[int64]PartnerCore, len(core.Partners))
	entries := make([]statistics.PersonSortEntry, 0, len(core.Partners))
	for _, partner := range core.Partners {
		if err := contextError(ctx); err != nil {
			return Page{}, err
		}
		rows[partner.Person.ID] = clonePartner(partner)
		entries = append(entries, sortEntry(partner))
	}

	leaders, err := buildLeaders(ctx, core.Scope, rows, entries)
	if err != nil {
		return Page{}, err
	}
	profile := sortProfile(view.Sort)
	ordered, err := statistics.SortPeople(ctx, profile, view.Order, entries)
	if err != nil {
		return Page{}, evaluationError(ctx, err)
	}

	filtered := make([]Item, 0, len(ordered))
	for index, personID := range ordered {
		if err := contextError(ctx); err != nil {
			return Page{}, err
		}
		partner, found := rows[personID]
		if !found {
			return Page{}, errors.New("partners: sorted person missing")
		}
		if view.Search != "" &&
			!strings.Contains(normalizeSearch(partner.Person.Name), view.Search) &&
			(partner.Person.NameCN == nil ||
				!strings.Contains(normalizeSearch(*partner.Person.NameCN), view.Search)) {
			continue
		}
		filtered = append(filtered, Item{
			Rank:        index + 1,
			PartnerCore: clonePartner(partner),
		})
	}

	total := len(filtered)
	start := checkedPageStart(view.Page, view.PageSize, total)
	end := start + view.PageSize
	if end > total {
		end = total
	}
	items := append([]Item{}, filtered[start:end]...)
	for index := range items {
		items[index].PartnerCore = clonePartner(items[index].PartnerCore)
	}
	return Page{
		WorkUnit: core.WorkUnit,
		Source:   cloneSource(core.Source),
		Summary: Summary{
			PartnerCount: len(core.Partners),
			Leaders:      cloneLeaders(leaders),
		},
		Items:    items,
		Page:     view.Page,
		PageSize: view.PageSize,
		Total:    total,
	}, nil
}

func validateCore(core Core) error {
	if core.DataVersion == "" || core.QueryDigest == "" ||
		(core.Scope != "global" && core.Scope != "personal") ||
		(core.WorkUnit != statistics.UnitSubject && core.WorkUnit != statistics.UnitSeries) ||
		core.Source.Person.ID <= 0 || len(core.Source.PositionKeys) == 0 ||
		core.Source.Metrics.WorkCount < 1 ||
		core.Source.Metrics.RatedWorkCount < 0 {
		return fieldError("")
	}
	seen := make(map[int64]struct{}, len(core.Partners))
	for _, partner := range core.Partners {
		if partner.Person.ID <= 0 || partner.Person.ID == core.Source.Person.ID ||
			partner.Metrics.WorkCount < 1 || partner.Metrics.RatedWorkCount < 0 ||
			len(partner.PositionKeys) == 0 {
			return fieldError("")
		}
		if _, duplicate := seen[partner.Person.ID]; duplicate {
			return fieldError("")
		}
		seen[partner.Person.ID] = struct{}{}
		if core.Scope == "global" && partner.Preference != nil {
			return fieldError("")
		}
		if core.Scope == "personal" && partner.Preference == nil {
			return fieldError("")
		}
	}
	return nil
}

func sortEntry(partner PartnerCore) statistics.PersonSortEntry {
	var preference *statistics.Rational
	effectiveEvidence := 0
	if partner.Preference != nil {
		preference = cloneRational(partner.Preference.Score)
		effectiveEvidence = partner.Preference.EffectiveEvidence
	}
	return statistics.PersonSortEntry{
		PersonID:          partner.Person.ID,
		Count:             partner.Metrics.WorkCount,
		AverageHundredths: cloneInt64(partner.Metrics.Average),
		ValidRatingCount:  partner.Metrics.RatedWorkCount,
		OverallHundredths: cloneInt64(partner.Metrics.Overall),
		Preference:        preference,
		EffectiveEvidence: effectiveEvidence,
	}
}

func sortProfile(metric Sort) statistics.SortProfile {
	switch metric {
	case SortAverage:
		return statistics.SortPersonAverage
	case SortOverall:
		return statistics.SortPersonOverall
	case SortPreference:
		return statistics.SortPersonPreference
	default:
		return statistics.SortPersonCount
	}
}

func buildLeaders(
	ctx context.Context,
	scope string,
	rows map[int64]PartnerCore,
	entries []statistics.PersonSortEntry,
) ([]Leader, error) {
	metrics := []Sort{SortCount, SortAverage, SortOverall}
	if scope == "personal" {
		metrics = append(metrics, SortPreference)
	}
	leaders := make([]Leader, 0, len(metrics))
	for _, metric := range metrics {
		ordered, err := statistics.SortPeople(
			ctx,
			sortProfile(metric),
			statistics.Descending,
			entries,
		)
		if err != nil {
			return nil, evaluationError(ctx, err)
		}
		leader := Leader{Metric: metric}
		for _, personID := range ordered {
			row := rows[personID]
			if !hasMetric(row, metric) {
				continue
			}
			copy := clonePartner(row)
			leader.Item = &copy
			break
		}
		leaders = append(leaders, leader)
	}
	return leaders, nil
}

func hasMetric(value PartnerCore, metric Sort) bool {
	switch metric {
	case SortCount:
		return value.Metrics.WorkCount > 0
	case SortAverage:
		return value.Metrics.Average != nil
	case SortOverall:
		return value.Metrics.Overall != nil
	case SortPreference:
		return value.Preference != nil && value.Preference.Score != nil
	default:
		return false
	}
}

func checkedPageStart(page int64, pageSize int, total int) int {
	offset := page - 1
	if offset < 0 || pageSize <= 0 ||
		offset > int64(math.MaxInt)/int64(pageSize) {
		return total
	}
	start := offset * int64(pageSize)
	if start >= int64(total) {
		return total
	}
	return int(start)
}

func cloneLeaders(values []Leader) []Leader {
	result := make([]Leader, len(values))
	for index, value := range values {
		result[index].Metric = value.Metric
		if value.Item != nil {
			copy := clonePartner(*value.Item)
			result[index].Item = &copy
		}
	}
	return result
}
