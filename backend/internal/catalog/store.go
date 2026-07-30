package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

const (
	positionQuery = `SELECT p.position_key, p.subject_type, p.position_kind,
p.label, p.name_cn, p.name_en, p.name_jp, p.display_order, p.selectable,
s.position_id, s.categories, s.status
FROM catalog_position AS p
LEFT JOIN staff_position AS s
  ON p.position_kind = 'staff'
 AND s.subject_type = p.subject_type
 AND p.position_key = 'staff:' || p.subject_type || ':' || s.position_id
ORDER BY CASE p.subject_type
  WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2
  WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END,
  p.display_order, p.position_key`
	memberQuery = `SELECT position_key, member_key
FROM catalog_position_member
ORDER BY position_key, member_key`
	groupQuery = `SELECT group_key, subject_type, label, display_order
FROM catalog_group
ORDER BY CASE subject_type
  WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2
  WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END,
  display_order, group_key`
	groupMemberQuery = `SELECT m.group_key, m.position_key, m.display_order
FROM catalog_group_member AS m
JOIN catalog_group AS g ON g.group_key = m.group_key
ORDER BY CASE g.subject_type
  WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2
  WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END,
  g.display_order, g.group_key, m.display_order, m.position_key`
	capabilityQuery = `SELECT position_key, capability, supported
FROM catalog_capability
ORDER BY position_key, CASE capability
  WHEN 'rankings' THEN 0 WHEN 'candidates' THEN 1
  WHEN 'personDetail' THEN 2 WHEN 'partners' THEN 3
  WHEN 'coStar' THEN 4 ELSE 5 END`
	ruleQuery = `SELECT r.rule_key, r.position_key, r.rule_kind, r.rule_value
FROM catalog_selection_rule AS r
JOIN catalog_position AS p ON p.position_key = r.position_key
ORDER BY CASE p.subject_type
  WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2
  WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END,
  p.display_order, p.position_key, r.rule_key`
)

type rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close() error
}

type storeReader interface {
	Identity() archive.Identity
	QueryContext(context.Context, string, ...any) (rows, error)
}

type archiveReader struct{ store *archive.Store }

func (r archiveReader) Identity() archive.Identity { return r.store.Identity() }
func (r archiveReader) QueryContext(ctx context.Context, query string, arguments ...any) (rows, error) {
	return r.store.QueryContext(ctx, query, arguments...)
}

type positionRecord struct {
	key, subjectType, kind, label string
	nameCN, nameEN, nameJP        sql.NullString
	displayOrder, selectable      int64
	positionID                    sql.NullInt64
	categoriesJSON, staffStatus   sql.NullString
	members                       []string
	capabilities                  []wire.CatalogPositionCapabilityNameV1
}

type groupRecord struct {
	key, subjectType, label string
	displayOrder            int64
	members                 []string
}

type ruleRecord struct {
	key, positionKey, kind, value string
}

// Project reads and validates one complete immutable Store catalog.
func Project(ctx context.Context, store *archive.Store) (Result, error) {
	if store == nil {
		return Result{}, invalid("nil Store")
	}
	return project(ctx, archiveReader{store: store})
}

func project(ctx context.Context, store storeReader) (Result, error) {
	if ctx == nil || store == nil {
		return Result{}, invalid("nil input")
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	identity := store.Identity()
	if !dataVersionPattern.MatchString(identity.DataVersion) {
		return Result{}, invalid("invalid dataVersion")
	}
	positions, err := readPositions(ctx, store)
	if err != nil {
		return Result{}, err
	}
	if err := readMembers(ctx, store, positions); err != nil {
		return Result{}, err
	}
	if err := readCapabilities(ctx, store, positions); err != nil {
		return Result{}, err
	}
	groups, err := readGroups(ctx, store)
	if err != nil {
		return Result{}, err
	}
	if err := readGroupMembers(ctx, store, groups); err != nil {
		return Result{}, err
	}
	rules, err := readRules(ctx, store)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	data, err := buildData(ctx, positions, groups, rules)
	if err != nil {
		return Result{}, err
	}
	filters, sorts, err := capabilityMatrices(ctx)
	if err != nil {
		return Result{}, err
	}
	data.FilterCapabilities = filters
	data.SortCapabilities = sorts
	return Result{DataVersion: identity.DataVersion, Data: data}, nil
}

func queryRows(ctx context.Context, store storeReader, query string, visit func(rows) error) (err error) {
	result, err := store.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("catalog read: %w", err)
	}
	defer func() {
		if closeErr := result.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("catalog close rows: %w", closeErr)
		}
	}()
	for result.Next() {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := visit(result); err != nil {
			return err
		}
	}
	if err := result.Err(); err != nil {
		return fmt.Errorf("catalog iterate rows: %w", err)
	}
	return nil
}

func readPositions(ctx context.Context, store storeReader) ([]*positionRecord, error) {
	var values []*positionRecord
	seen := make(map[string]struct{})
	err := queryRows(ctx, store, positionQuery, func(row rows) error {
		value := new(positionRecord)
		if err := row.Scan(
			&value.key, &value.subjectType, &value.kind, &value.label,
			&value.nameCN, &value.nameEN, &value.nameJP,
			&value.displayOrder, &value.selectable, &value.positionID,
			&value.categoriesJSON, &value.staffStatus,
		); err != nil {
			return fmt.Errorf("catalog scan position: %w", err)
		}
		if len(values) >= 50_260 {
			return invalid("too many positions")
		}
		if _, duplicate := seen[value.key]; duplicate {
			return invalid("duplicate position %q", value.key)
		}
		seen[value.key] = struct{}{}
		values = append(values, value)
		return nil
	})
	return values, err
}

func readMembers(ctx context.Context, store storeReader, positions []*positionRecord) error {
	byKey := positionMap(positions)
	return queryRows(ctx, store, memberQuery, func(row rows) error {
		var positionKey, memberKey string
		if err := row.Scan(&positionKey, &memberKey); err != nil {
			return fmt.Errorf("catalog scan member: %w", err)
		}
		position := byKey[positionKey]
		if position == nil || len(position.members) >= 256 ||
			slices.Contains(position.members, memberKey) {
			return invalid("invalid position member")
		}
		position.members = append(position.members, memberKey)
		return nil
	})
}

func readCapabilities(ctx context.Context, store storeReader, positions []*positionRecord) error {
	byKey := positionMap(positions)
	return queryRows(ctx, store, capabilityQuery, func(row rows) error {
		var positionKey, capability string
		var supported int64
		if err := row.Scan(&positionKey, &capability, &supported); err != nil {
			return fmt.Errorf("catalog scan capability: %w", err)
		}
		position := byKey[positionKey]
		value := wire.CatalogPositionCapabilityNameV1(capability)
		if position == nil || supported != 1 || !value.Valid() ||
			slices.Contains(position.capabilities, value) {
			return invalid("invalid capability")
		}
		position.capabilities = append(position.capabilities, value)
		return nil
	})
}

func readGroups(ctx context.Context, store storeReader) ([]*groupRecord, error) {
	var values []*groupRecord
	seen := make(map[string]struct{})
	err := queryRows(ctx, store, groupQuery, func(row rows) error {
		value := new(groupRecord)
		if err := row.Scan(&value.key, &value.subjectType, &value.label, &value.displayOrder); err != nil {
			return fmt.Errorf("catalog scan group: %w", err)
		}
		if len(values) >= 50_260 {
			return invalid("too many groups")
		}
		if _, duplicate := seen[value.key]; duplicate {
			return invalid("duplicate group")
		}
		seen[value.key] = struct{}{}
		values = append(values, value)
		return nil
	})
	return values, err
}

func readGroupMembers(ctx context.Context, store storeReader, groups []*groupRecord) error {
	byKey := make(map[string]*groupRecord, len(groups))
	for _, group := range groups {
		byKey[group.key] = group
	}
	lastOrder := make(map[string]int64)
	return queryRows(ctx, store, groupMemberQuery, func(row rows) error {
		var groupKey, positionKey string
		var displayOrder int64
		if err := row.Scan(&groupKey, &positionKey, &displayOrder); err != nil {
			return fmt.Errorf("catalog scan group member: %w", err)
		}
		group := byKey[groupKey]
		if group == nil || displayOrder < 0 || displayOrder > maxJSONInteger ||
			len(group.members) >= 10_000 || slices.Contains(group.members, positionKey) {
			return invalid("invalid group member")
		}
		if len(group.members) > 0 && displayOrder < lastOrder[groupKey] {
			return invalid("group member order")
		}
		lastOrder[groupKey] = displayOrder
		group.members = append(group.members, positionKey)
		return nil
	})
}

func readRules(ctx context.Context, store storeReader) ([]ruleRecord, error) {
	var values []ruleRecord
	seen := make(map[string]struct{})
	err := queryRows(ctx, store, ruleQuery, func(row rows) error {
		var value ruleRecord
		if err := row.Scan(&value.key, &value.positionKey, &value.kind, &value.value); err != nil {
			return fmt.Errorf("catalog scan rule: %w", err)
		}
		identity := value.key + "\x00" + value.positionKey
		if len(values) >= 50_260 {
			return invalid("too many rules")
		}
		if _, duplicate := seen[identity]; duplicate {
			return invalid("duplicate rule")
		}
		seen[identity] = struct{}{}
		values = append(values, value)
		return nil
	})
	return values, err
}

func positionMap(values []*positionRecord) map[string]*positionRecord {
	result := make(map[string]*positionRecord, len(values))
	for _, value := range values {
		result[value.key] = value
	}
	return result
}

func buildData(ctx context.Context, positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) (wire.CatalogDataV1, error) {
	if err := ctx.Err(); err != nil {
		return wire.CatalogDataV1{}, err
	}
	if !slices.IsSortedFunc(positions, comparePositions) ||
		!slices.IsSortedFunc(groups, compareGroups) {
		return wire.CatalogDataV1{}, invalid("entity order")
	}
	byKey := positionMap(positions)
	ruleByPosition := make(map[string]ruleRecord, len(rules))
	for _, rule := range rules {
		if err := ctx.Err(); err != nil {
			return wire.CatalogDataV1{}, err
		}
		if _, duplicate := ruleByPosition[rule.positionKey]; duplicate {
			return wire.CatalogDataV1{}, invalid("multiple position rules")
		}
		ruleByPosition[rule.positionKey] = rule
	}
	data := wire.CatalogDataV1{
		SubjectTypes:   catalogSubjectTypes(),
		Positions:      make([]wire.CatalogPositionV1, 0, len(positions)),
		Groups:         make([]wire.CatalogGroupV1, 0, len(groups)),
		SelectionRules: make([]wire.CatalogSelectionRuleV1, 0, len(rules)),
	}
	for _, position := range positions {
		if err := ctx.Err(); err != nil {
			return wire.CatalogDataV1{}, err
		}
		value, selectionRule, err := buildPosition(position, byKey, ruleByPosition[position.key])
		if err != nil {
			return wire.CatalogDataV1{}, err
		}
		data.Positions = append(data.Positions, value)
		data.SelectionRules = append(data.SelectionRules, selectionRule)
	}
	if len(ruleByPosition) != len(rules) || len(rules) != len(positions) {
		return wire.CatalogDataV1{}, invalid("rule closure")
	}
	for _, group := range groups {
		if err := ctx.Err(); err != nil {
			return wire.CatalogDataV1{}, err
		}
		kind, ok := groupKind(group.key)
		if !ok || !validSubject(group.subjectType) || !validText(group.key, 96) ||
			!validText(group.label, 255) || group.displayOrder < 0 ||
			group.displayOrder > maxJSONInteger {
			return wire.CatalogDataV1{}, invalid("invalid group")
		}
		for _, memberKey := range group.members {
			member := byKey[memberKey]
			if member == nil || member.subjectType != group.subjectType ||
				member.selectable != 1 {
				return wire.CatalogDataV1{}, invalid("group reference")
			}
		}
		data.Groups = append(data.Groups, wire.CatalogGroupV1{
			Key: group.key, Kind: kind, SubjectType: wire.CatalogSubjectTypeKeyV1(group.subjectType),
			Label: group.label, DisplayOrder: int(group.displayOrder),
			PositionKeys: append([]string{}, group.members...),
		})
	}
	return data, nil
}

func buildPosition(position *positionRecord, byKey map[string]*positionRecord, rule ruleRecord) (wire.CatalogPositionV1, wire.CatalogSelectionRuleV1, error) {
	if !validSubject(position.subjectType) || !validText(position.key, 96) ||
		!validText(position.label, 255) || !position.nameCN.Valid ||
		!validText(position.nameCN.String, 255) ||
		position.nameEN.Valid && !validText(position.nameEN.String, 255) ||
		position.nameJP.Valid && !validText(position.nameJP.String, 255) ||
		position.displayOrder < 0 || position.displayOrder > maxJSONInteger ||
		(position.selectable != 0 && position.selectable != 1) ||
		!validCapabilities(position.capabilities) {
		return wire.CatalogPositionV1{}, wire.CatalogSelectionRuleV1{}, invalid("invalid position")
	}
	if position.selectable == 0 && len(position.capabilities) != 0 {
		return wire.CatalogPositionV1{}, wire.CatalogSelectionRuleV1{}, invalid("hidden capabilities")
	}
	names := wire.CatalogLocalizedNamesV1{
		Cn: position.nameCN.String,
		En: nullString(position.nameEN),
		Jp: nullString(position.nameJP),
	}
	status := "hidden"
	if position.selectable == 1 {
		status = "selectable"
	}
	subjectType := wire.CatalogSubjectTypeKeyV1(position.subjectType)
	var result wire.CatalogPositionV1
	selection := wire.CatalogSelectionRuleV1{
		Key: "rule:" + position.key, PositionKey: position.key,
	}
	switch position.kind {
	case "staff":
		match := staffKeyPattern.FindStringSubmatch(position.key)
		if len(match) != 3 || match[1] != position.subjectType ||
			!position.positionID.Valid || !position.categoriesJSON.Valid ||
			!position.staffStatus.Valid || position.staffStatus.String != status {
			return result, selection, invalid("invalid staff position")
		}
		id, err := strconv.ParseInt(match[2], 10, 64)
		if err != nil || id != position.positionID.Int64 || id > maxJSONInteger ||
			len(position.members) != 0 || rule.kind != "exactStaff" ||
			rule.key != "rule:"+position.key || rule.value != match[2] {
			return result, selection, invalid("invalid staff identity")
		}
		var categories []string
		if err := json.Unmarshal([]byte(position.categoriesJSON.String), &categories); err != nil ||
			!validCategories(categories) {
			return result, selection, invalid("invalid staff categories")
		}
		if err := result.FromCatalogStaffPositionV1(wire.CatalogStaffPositionV1{
			Key: position.key, Kind: "staff", SubjectType: subjectType,
			Label: position.label, Names: names, Categories: categories,
			DisplayOrder: int(position.displayOrder), Capabilities: append([]wire.CatalogPositionCapabilityNameV1{}, position.capabilities...),
			Status: wire.CatalogStaffPositionV1Status(status), PositionId: int(id),
		}); err != nil {
			return result, selection, invalid("wrap staff position: %v", err)
		}
		selection.Kind, selection.Value = wire.ExactStaff, rule.value
	case "cast":
		match := castKeyPattern.FindStringSubmatch(position.key)
		if len(match) != 3 || match[1] != position.subjectType ||
			position.positionID.Valid || position.categoriesJSON.Valid ||
			position.staffStatus.Valid || len(position.members) != 0 ||
			rule.kind != "exactCast" || rule.key != "exclusive:cast:"+position.subjectType {
			return result, selection, invalid("invalid cast position")
		}
		expectedValue := map[string]string{"main": "1", "all": "1..6"}[match[2]]
		if rule.value != expectedValue {
			return result, selection, invalid("invalid cast rule")
		}
		if err := result.FromCatalogCastPositionV1(wire.CatalogCastPositionV1{
			Key: position.key, Kind: "cast", SubjectType: subjectType,
			Label: position.label, Names: names, Categories: []string{"cast"},
			DisplayOrder: int(position.displayOrder), Capabilities: append([]wire.CatalogPositionCapabilityNameV1{}, position.capabilities...),
			Status:         wire.CatalogCastPositionV1Status(status),
			ExclusiveGroup: "cast:" + position.subjectType,
			RoleScope:      wire.CatalogCastPositionV1RoleScope(match[2]),
		}); err != nil {
			return result, selection, invalid("wrap cast position: %v", err)
		}
		selection.Kind, selection.Value = wire.ExactCast, rule.value
	case "staffSet":
		if !staffSetKeyPattern.MatchString(position.key) ||
			!strings.HasPrefix(position.key, "staffset:"+position.subjectType+":") ||
			position.positionID.Valid || position.categoriesJSON.Valid ||
			position.staffStatus.Valid || len(position.members) < 2 ||
			rule.kind != "staffSetUnion" || rule.key != "rule:"+position.key ||
			rule.value != position.key || !slices.IsSorted(position.members) {
			return result, selection, invalid("invalid staff set")
		}
		members := make([]*positionRecord, 0, len(position.members))
		for _, memberKey := range position.members {
			member := byKey[memberKey]
			if member == nil || member.kind != "staff" ||
				member.subjectType != position.subjectType || member.selectable != 1 {
				return result, selection, invalid("invalid staff-set member")
			}
			members = append(members, member)
		}
		expectedCapabilities := make(
			[]wire.CatalogPositionCapabilityNameV1,
			0,
			len(orderedCapabilities()),
		)
		for _, capability := range orderedCapabilities() {
			supportedByAll := true
			for _, member := range members {
				if !slices.Contains(member.capabilities, capability) {
					supportedByAll = false
					break
				}
			}
			if supportedByAll {
				expectedCapabilities = append(expectedCapabilities, capability)
			}
		}
		if !slices.Equal(position.capabilities, expectedCapabilities) {
			return result, selection, invalid("invalid staff-set capabilities")
		}
		if err := result.FromCatalogStaffSetPositionV1(wire.CatalogStaffSetPositionV1{
			Key: position.key, Kind: "staffSet", SubjectType: subjectType,
			Label: position.label, Names: names, Categories: []string{},
			DisplayOrder: int(position.displayOrder), Capabilities: append([]wire.CatalogPositionCapabilityNameV1{}, position.capabilities...),
			Status:     wire.CatalogStaffSetPositionV1Status(status),
			MemberKeys: append([]string{}, position.members...),
		}); err != nil {
			return result, selection, invalid("wrap staff set: %v", err)
		}
		selection.Kind, selection.Value = wire.StaffSetUnion, strings.Join(position.members, "|")
	default:
		return result, selection, invalid("unknown position kind")
	}
	return result, selection, nil
}

func nullString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	copy := value.String
	return &copy
}

func comparePositions(left, right *positionRecord) int {
	if difference := subjectRank(left.subjectType) - subjectRank(right.subjectType); difference != 0 {
		return difference
	}
	if left.displayOrder < right.displayOrder {
		return -1
	}
	if left.displayOrder > right.displayOrder {
		return 1
	}
	return strings.Compare(left.key, right.key)
}

func compareGroups(left, right *groupRecord) int {
	if difference := subjectRank(left.subjectType) - subjectRank(right.subjectType); difference != 0 {
		return difference
	}
	if left.displayOrder < right.displayOrder {
		return -1
	}
	if left.displayOrder > right.displayOrder {
		return 1
	}
	return strings.Compare(left.key, right.key)
}
