package query

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

const (
	selectSubjects = `SELECT subject_id, nsfw, air_date, air_date_precision, score
FROM subject
WHERE subject_type = ?
ORDER BY subject_id`
	selectRatingBuckets = `SELECT subject_id, rating, vote_count
FROM subject_rating_bucket
WHERE subject_type = ?
ORDER BY subject_id, rating`
	selectSubjectTags = `SELECT subject_id, tag_scope, tag_name
FROM subject_tag
WHERE subject_type = ?
ORDER BY subject_id, tag_scope, tag_name`
	selectStaffCredits = `SELECT subject_id, person_id, position_id
FROM staff_credit
WHERE subject_type = ?
ORDER BY subject_id, person_id, position_id`
	selectCastCredits = `SELECT subject_id, person_id, character_id, role_type, sort_order
FROM cast_credit
WHERE subject_type = ? AND eligible = 1 AND provenance = 'exact'
ORDER BY subject_id, person_id, sort_order, character_id`
	selectSelectionPlans = `SELECT rule.rule_key, position.position_key, rule.rule_kind, rule.rule_value
FROM catalog_position AS position
JOIN catalog_selection_rule AS rule ON rule.position_key = position.position_key
WHERE position.subject_type = ? AND position.selectable = 1
ORDER BY position.display_order, position.position_key, rule.rule_key`
	selectPositionMembers = `SELECT member.position_key, member.member_key
FROM catalog_position_member AS member
JOIN catalog_position AS position ON position.position_key = member.position_key
WHERE position.subject_type = ? AND position.selectable = 1
ORDER BY member.position_key, member.member_key`
)

// LoadFactSet reads one subject-type universe through Store's immutable,
// single-SELECT boundary. It returns no partial snapshot on any error.
func LoadFactSet(ctx context.Context, store *archive.Store, subjectType string) (FactSet, error) {
	return loadFactSet(ctx, store, subjectType, loadFactSetHooks{})
}

type loadFactSetHooks struct {
	afterSubject func(int)
}

func loadFactSet(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	hooks loadFactSetHooks,
) (FactSet, error) {
	if err := contextCause(ctx); err != nil {
		return FactSet{}, err
	}
	if store == nil {
		return FactSet{}, errors.New("query: nil archive store")
	}

	subjects, subjectIndex, err := loadSubjects(ctx, store, subjectType, hooks)
	if err != nil {
		return FactSet{}, err
	}
	if err := loadRatingBuckets(ctx, store, subjectType, subjects, subjectIndex); err != nil {
		return FactSet{}, err
	}
	if err := loadSubjectTags(ctx, store, subjectType, subjects, subjectIndex); err != nil {
		return FactSet{}, err
	}
	staffCredits, err := loadStaffCredits(ctx, store, subjectType)
	if err != nil {
		return FactSet{}, err
	}
	castCredits, err := loadCastCredits(ctx, store, subjectType)
	if err != nil {
		return FactSet{}, err
	}
	plans, err := loadSelectionPlans(ctx, store, subjectType)
	if err != nil {
		return FactSet{}, err
	}
	if err := contextCause(ctx); err != nil {
		return FactSet{}, err
	}
	return FactSet{
		Subjects:     subjects,
		StaffCredits: staffCredits,
		CastCredits:  castCredits,
		Plans:        plans,
	}, nil
}

func loadSubjects(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	hooks loadFactSetHooks,
) ([]Subject, map[int64]int, error) {
	rows, err := store.QueryContext(ctx, selectSubjects, subjectType)
	if err != nil {
		return nil, nil, contextualExternalError(ctx, "query subjects", err)
	}
	defer rows.Close()

	subjects := make([]Subject, 0)
	index := make(map[int64]int)
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return nil, nil, err
		}
		var id, nsfw int64
		var airDate sql.NullString
		var precision sql.NullInt64
		var score sql.NullFloat64
		if err := rows.Scan(&id, &nsfw, &airDate, &precision, &score); err != nil {
			return nil, nil, contextualExternalError(ctx, "scan subject", err)
		}
		subject := Subject{
			SubjectID:     id,
			SubjectType:   subjectType,
			NSFW:          nsfw == 1,
			RatingBuckets: make([]RatingBucket, 0),
			Tags:          make([]SubjectTag, 0),
		}
		if airDate.Valid {
			value := airDate.String
			subject.AirDate = &value
		}
		if precision.Valid {
			value := precision.Int64
			subject.AirDatePrecision = &value
		}
		if score.Valid {
			value := score.Float64
			subject.GlobalScore = &value
		}
		index[id] = len(subjects)
		subjects = append(subjects, subject)
		if hooks.afterSubject != nil {
			hooks.afterSubject(len(subjects))
		}
		if err := contextCause(ctx); err != nil {
			return nil, nil, err
		}
	}
	if err := rowsCompletion(ctx, rows, "subjects"); err != nil {
		return nil, nil, err
	}
	return subjects, index, nil
}

func loadRatingBuckets(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	subjects []Subject,
	subjectIndex map[int64]int,
) error {
	rows, err := store.QueryContext(ctx, selectRatingBuckets, subjectType)
	if err != nil {
		return contextualExternalError(ctx, "query rating buckets", err)
	}
	defer rows.Close()
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return err
		}
		var subjectID, rating, count int64
		if err := rows.Scan(&subjectID, &rating, &count); err != nil {
			return contextualExternalError(ctx, "scan rating bucket", err)
		}
		offset, ok := subjectIndex[subjectID]
		if !ok {
			return fmt.Errorf("query: rating bucket references unknown subject %d", subjectID)
		}
		subjects[offset].RatingBuckets = append(subjects[offset].RatingBuckets, RatingBucket{
			Rating: rating,
			Count:  count,
		})
	}
	if err := rowsCompletion(ctx, rows, "rating buckets"); err != nil {
		return err
	}
	return nil
}

func loadSubjectTags(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	subjects []Subject,
	subjectIndex map[int64]int,
) error {
	rows, err := store.QueryContext(ctx, selectSubjectTags, subjectType)
	if err != nil {
		return contextualExternalError(ctx, "query subject tags", err)
	}
	defer rows.Close()
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return err
		}
		var subjectID int64
		var scope, name string
		if err := rows.Scan(&subjectID, &scope, &name); err != nil {
			return contextualExternalError(ctx, "scan subject tag", err)
		}
		offset, ok := subjectIndex[subjectID]
		if !ok {
			return fmt.Errorf("query: tag references unknown subject %d", subjectID)
		}
		subjects[offset].Tags = append(subjects[offset].Tags, SubjectTag{
			Scope: scope,
			Name:  name,
		})
	}
	if err := rowsCompletion(ctx, rows, "subject tags"); err != nil {
		return err
	}
	return nil
}

func loadStaffCredits(ctx context.Context, store *archive.Store, subjectType string) ([]StaffCredit, error) {
	rows, err := store.QueryContext(ctx, selectStaffCredits, subjectType)
	if err != nil {
		return nil, contextualExternalError(ctx, "query staff credits", err)
	}
	defer rows.Close()
	credits := make([]StaffCredit, 0)
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		var credit StaffCredit
		if err := rows.Scan(&credit.SubjectID, &credit.PersonID, &credit.PositionID); err != nil {
			return nil, contextualExternalError(ctx, "scan staff credit", err)
		}
		credits = append(credits, credit)
	}
	if err := rowsCompletion(ctx, rows, "staff credits"); err != nil {
		return nil, err
	}
	return credits, nil
}

func loadCastCredits(ctx context.Context, store *archive.Store, subjectType string) ([]CastCredit, error) {
	rows, err := store.QueryContext(ctx, selectCastCredits, subjectType)
	if err != nil {
		return nil, contextualExternalError(ctx, "query cast credits", err)
	}
	defer rows.Close()
	credits := make([]CastCredit, 0)
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		var credit CastCredit
		if err := rows.Scan(
			&credit.SubjectID,
			&credit.PersonID,
			&credit.CharacterID,
			&credit.RoleType,
			&credit.SortOrder,
		); err != nil {
			return nil, contextualExternalError(ctx, "scan cast credit", err)
		}
		credits = append(credits, credit)
	}
	if err := rowsCompletion(ctx, rows, "cast credits"); err != nil {
		return nil, err
	}
	return credits, nil
}

func loadSelectionPlans(ctx context.Context, store *archive.Store, subjectType string) ([]SelectionPlan, error) {
	rows, err := store.QueryContext(ctx, selectSelectionPlans, subjectType)
	if err != nil {
		return nil, contextualExternalError(ctx, "query selection plans", err)
	}
	defer rows.Close()

	plans := make([]SelectionPlan, 0)
	seen := make(map[string]struct{})
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		var ruleKey, key, kind, value string
		if err := rows.Scan(&ruleKey, &key, &kind, &value); err != nil {
			return nil, contextualExternalError(ctx, "scan selection plan", err)
		}
		if _, duplicate := seen[key]; duplicate {
			return nil, fmt.Errorf("query: duplicate selection plan for %q", key)
		}
		plan, err := parseSelectionPlan(ruleKey, key, kind, value)
		if err != nil {
			return nil, err
		}
		seen[key] = struct{}{}
		plans = append(plans, plan)
	}
	if err := rowsCompletion(ctx, rows, "selection plans"); err != nil {
		return nil, err
	}

	members, err := loadPositionMembers(ctx, store, subjectType)
	if err != nil {
		return nil, err
	}
	for index := range plans {
		if plans[index].RuleKind == "staffSetUnion" {
			plans[index].MemberPositionKeys = append([]string(nil), members[plans[index].PositionKey]...)
			if len(plans[index].MemberPositionKeys) == 0 {
				return nil, fmt.Errorf("query: staff set %q has no exact members", plans[index].PositionKey)
			}
		}
	}
	return plans, nil
}

func loadPositionMembers(ctx context.Context, store *archive.Store, subjectType string) (map[string][]string, error) {
	rows, err := store.QueryContext(ctx, selectPositionMembers, subjectType)
	if err != nil {
		return nil, contextualExternalError(ctx, "query position members", err)
	}
	defer rows.Close()
	members := make(map[string][]string)
	for rows.Next() {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		var key, member string
		if err := rows.Scan(&key, &member); err != nil {
			return nil, contextualExternalError(ctx, "scan position member", err)
		}
		members[key] = append(members[key], member)
	}
	if err := rowsCompletion(ctx, rows, "position members"); err != nil {
		return nil, err
	}
	return members, nil
}

func rowsCompletion(ctx context.Context, rows *archive.Rows, label string) error {
	rowsErr := rows.Err()
	if cause := contextCause(ctx); cause != nil {
		return cause
	}
	if rowsErr != nil {
		return fmt.Errorf("iterate %s: %w", label, rowsErr)
	}
	return nil
}

func contextualExternalError(ctx context.Context, label string, err error) error {
	if cause := contextCause(ctx); cause != nil {
		return cause
	}
	return fmt.Errorf("%s: %w", label, err)
}

func parseSelectionPlan(ruleKey, key, kind, value string) (SelectionPlan, error) {
	plan := SelectionPlan{PositionKey: key, RuleKind: kind}
	parts := strings.Split(key, ":")
	switch kind {
	case "exactStaff":
		if len(parts) != 3 || parts[0] != "staff" ||
			!validPlanSubjectType(parts[1]) || !positiveDecimal(parts[2]) ||
			ruleKey != "rule:"+key || value != parts[2] {
			return SelectionPlan{}, fmt.Errorf("query: invalid exactStaff rule for %q", key)
		}
		positionID, err := strconv.ParseInt(value, 10, 64)
		if err != nil || positionID <= 0 {
			return SelectionPlan{}, fmt.Errorf("query: invalid exactStaff rule for %q", key)
		}
		plan.PositionID = positionID
	case "exactCast":
		if len(parts) != 3 || parts[0] != "cast" ||
			(parts[1] != "anime" && parts[1] != "game") ||
			ruleKey != "exclusive:cast:"+parts[1] {
			return SelectionPlan{}, fmt.Errorf("query: invalid exactCast rule for %q", key)
		}
		switch {
		case parts[2] == "main" && value == "1":
			plan.RoleTypes = []int64{1}
		case parts[2] == "all" && value == "1..6":
			plan.RoleTypes = []int64{1, 2, 3, 4, 5, 6}
		default:
			return SelectionPlan{}, fmt.Errorf("query: invalid exactCast rule for %q", key)
		}
	case "staffSetUnion":
		if len(parts) != 3 || parts[0] != "staffset" ||
			!validPlanSubjectType(parts[1]) || !validPlanSlug(parts[2]) ||
			ruleKey != "rule:"+key || value != key {
			return SelectionPlan{}, fmt.Errorf("query: invalid staffSetUnion rule for %q", key)
		}
	default:
		return SelectionPlan{}, fmt.Errorf("query: unsupported selection rule %q", kind)
	}
	return plan, nil
}

func validPlanSubjectType(value string) bool {
	switch value {
	case "book", "anime", "music", "game", "real":
		return true
	default:
		return false
	}
}

func validPlanSlug(value string) bool {
	if value == "" || value[0] == '-' || value[len(value)-1] == '-' {
		return false
	}
	previousHyphen := false
	for index := 0; index < len(value); index++ {
		character := value[index]
		if character == '-' {
			if previousHyphen {
				return false
			}
			previousHyphen = true
			continue
		}
		if (character < 'a' || character > 'z') &&
			(character < '0' || character > '9') {
			return false
		}
		previousHyphen = false
	}
	return true
}

func positiveDecimal(value string) bool {
	if value == "" || value[0] < '1' || value[0] > '9' {
		return false
	}
	for index := 1; index < len(value); index++ {
		if value[index] < '0' || value[index] > '9' {
			return false
		}
	}
	return true
}

func contextCause(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		if cause := context.Cause(ctx); cause != nil {
			return cause
		}
		return err
	}
	return nil
}
