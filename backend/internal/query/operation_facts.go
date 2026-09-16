package query

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

// factualOperationPlans admits only exact identities evidenced by the current
// subject-type snapshot. Catalog visibility is not factual participation.
func factualOperationPlans(ctx context.Context, facts FactSet, subjectType string) ([]SelectionPlan, error) {
	subjects := make(map[int64]bool, len(facts.Subjects))
	for _, subject := range facts.Subjects {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if subject.SubjectType == subjectType {
			subjects[subject.SubjectID] = true
		}
	}
	plans := make(map[string]SelectionPlan)
	positions := make(map[int64]struct{})
	for _, credit := range facts.StaffCredits {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if !subjects[credit.SubjectID] || credit.PositionID <= 0 {
			continue
		}
		if _, seen := positions[credit.PositionID]; seen {
			continue
		}
		positions[credit.PositionID] = struct{}{}
		key := fmt.Sprintf("staff:%s:%d", subjectType, credit.PositionID)
		plans[key] = SelectionPlan{PositionKey: key, RuleKind: "exactStaff", PositionID: credit.PositionID}
	}
	if subjectType == "anime" || subjectType == "game" {
		key := "cast:" + subjectType + ":all"
		plans[key] = SelectionPlan{PositionKey: key, RuleKind: "exactCast", RoleTypes: []int64{1, 2, 3, 4, 5, 6}}
	}
	keys := make([]string, 0, len(plans))
	for key := range plans {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]SelectionPlan, 0, len(keys))
	for _, key := range keys {
		result = append(result, plans[key])
	}
	return result, nil
}

// OperationAuthority is resolved only inside an admitted result worker. It
// carries one immutable fact snapshot and the separate browse/membership sets.
type OperationAuthority struct {
	Facts      FactSet
	Membership []string
	Browse     []string
}

// LoadOperationAuthority loads facts once and scans factual participation once.
// Legacy operation-all remains catalog-only; submitted keys confer no authority.
// observe, when nonnil, receives only the fact-load duration and outcome, once.
func LoadOperationAuthority(ctx context.Context, store *archive.Store, normalized NormalizedQuery, catalog CatalogContext, supported map[string]bool, scope string, observe func(time.Duration, error)) (OperationAuthority, error) {
	sqliteStarted := time.Now()
	facts, err := LoadFactSet(ctx, store, normalized.Effective.SubjectType)
	if observe != nil {
		observe(time.Since(sqliteStarted), err)
	}
	if err != nil {
		return OperationAuthority{}, err
	}
	result := OperationAuthority{Facts: facts,
		Membership: OperationPositions(normalized.Effective, catalog, supported, scope, false),
		Browse:     OperationPositions(normalized.Effective, catalog, supported, scope, true)}
	if normalized.Effective.PositionScope != "all" {
		return result, nil
	}
	plans, err := factualOperationPlans(ctx, facts, normalized.Effective.SubjectType)
	if err != nil {
		return OperationAuthority{}, err
	}
	result.Browse = make([]string, 0, len(plans))
	for _, plan := range plans {
		result.Browse = append(result.Browse, plan.PositionKey)
	}
	result.Membership = append(result.Membership, result.Browse...)
	sort.Strings(result.Membership)
	result.Membership = uniqueOperationPositions(result.Membership)
	result.Facts = operationFactsWithPlans(facts, plans)
	return result, nil
}

// OperationFacts carries exact factual plans through independent operation
// narrowing and into statistics. Clone the plan slice: cached Archive facts and
// the persistent selector catalog remain immutable. The original projection
// retains shared-all authority after OperationEvaluation clears PositionScope.
func OperationFacts(ctx context.Context, normalized NormalizedQuery, facts FactSet) (FactSet, error) {
	if normalized.Projection.PositionScope != "all" && normalized.Effective.PositionScope != "all" {
		return facts, nil
	}
	plans, err := factualOperationPlans(ctx, facts, normalized.Effective.SubjectType)
	if err != nil {
		return FactSet{}, err
	}
	return operationFactsWithPlans(facts, plans), nil
}

func operationFactsWithPlans(facts FactSet, plans []SelectionPlan) FactSet {
	replacements := make(map[string]bool, len(plans))
	for _, plan := range plans {
		replacements[plan.PositionKey] = true
	}
	result := make([]SelectionPlan, 0, len(facts.Plans)+len(plans))
	for _, plan := range facts.Plans {
		if !replacements[plan.PositionKey] {
			result = append(result, plan)
		}
	}
	facts.Plans = append(result, plans...)
	return facts
}
