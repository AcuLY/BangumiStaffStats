package statistics

import (
	"context"
	"sort"
	"strings"
)

// SeriesSubject is the minimum immutable fact needed for versioned grouping.
type SeriesSubject struct {
	SubjectID   int64
	SubjectType string
	AirDate     *string
}

type subjectKey struct {
	subjectType string
	subjectID   int64
}

type componentRecord struct {
	seriesID         int64
	memberIDs        []int64
	representativeID int64
}

// SeriesIndex is an immutable connected-component and representative index
// bound to one Archive dataVersion.
type SeriesIndex struct {
	dataVersion string
	bySubject   map[subjectKey]componentRecord
	components  map[string][]componentRecord
}

// BuildSeriesIndex constructs a private result and publishes it only after all
// facts have validated and all canonical ordering has completed.
func BuildSeriesIndex(
	ctx context.Context,
	dataVersion string,
	subjects []SeriesSubject,
	relations []Relation,
) (*SeriesIndex, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if !validDataVersion(dataVersion) {
		return nil, outcome(CodeInputInvalid)
	}
	subjectByKey := make(map[subjectKey]SeriesSubject, len(subjects))
	keysByType := make(map[string][]subjectKey)
	for _, subject := range subjects {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if subject.SubjectID <= 0 || !validSubjectType(subject.SubjectType) {
			return nil, outcome(CodeInputInvalid)
		}
		key := subjectKey{subjectType: subject.SubjectType, subjectID: subject.SubjectID}
		if _, duplicate := subjectByKey[key]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		if _, _, err := canonicalDate(subject.AirDate); err != nil {
			return nil, err
		}
		subjectByKey[key] = SeriesSubject{
			SubjectID:   subject.SubjectID,
			SubjectType: subject.SubjectType,
			AirDate:     cloneString(subject.AirDate),
		}
		keysByType[subject.SubjectType] = append(keysByType[subject.SubjectType], key)
	}

	parents := make(map[subjectKey]subjectKey, len(subjects))
	for key := range subjectByKey {
		parents[key] = key
	}
	var find func(subjectKey) subjectKey
	find = func(key subjectKey) subjectKey {
		parent := parents[key]
		if parent != key {
			parents[key] = find(parent)
		}
		return parents[key]
	}
	union := func(left, right subjectKey) {
		leftRoot := find(left)
		rightRoot := find(right)
		if leftRoot == rightRoot {
			return
		}
		if keyLess(rightRoot, leftRoot) {
			leftRoot, rightRoot = rightRoot, leftRoot
		}
		parents[rightRoot] = leftRoot
	}

	for _, relation := range relations {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if relation.SourceID <= 0 || relation.TargetID <= 0 ||
			relation.RelationID <= 0 ||
			!validSubjectType(relation.SourceType) ||
			!validSubjectType(relation.TargetType) {
			continue
		}
		source := subjectKey{subjectType: relation.SourceType, subjectID: relation.SourceID}
		target := subjectKey{subjectType: relation.TargetType, subjectID: relation.TargetID}
		if _, exists := subjectByKey[source]; !exists {
			continue
		}
		if _, exists := subjectByKey[target]; !exists {
			continue
		}
		if relation.SourceType == "anime" && relation.TargetType == "anime" &&
			mergeRelation(relation.RelationID) {
			union(source, target)
		}
	}

	grouped := make(map[subjectKey][]subjectKey, len(subjects))
	for key := range subjectByKey {
		root := find(key)
		grouped[root] = append(grouped[root], key)
	}
	scores := make(map[subjectKey]int64, len(subjects))
	for _, relation := range relations {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		source := subjectKey{subjectType: relation.SourceType, subjectID: relation.SourceID}
		target := subjectKey{subjectType: relation.TargetType, subjectID: relation.TargetID}
		if _, exists := subjectByKey[source]; !exists {
			continue
		}
		if _, exists := subjectByKey[target]; !exists {
			continue
		}
		sourceWeight, targetWeight := sequelWeights(relation.RelationID, relation.SourceType == relation.TargetType)
		scores[source] += sourceWeight
		scores[target] += targetWeight
	}

	bySubject := make(map[subjectKey]componentRecord, len(subjects))
	components := make(map[string][]componentRecord, len(keysByType))
	for _, members := range grouped {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		sort.Slice(members, func(left, right int) bool {
			leftScore := scores[members[left]]
			rightScore := scores[members[right]]
			if leftScore != rightScore {
				return leftScore > rightScore
			}
			leftDate := subjectByKey[members[left]].AirDate
			rightDate := subjectByKey[members[right]].AirDate
			if compared := comparePartialDates(leftDate, rightDate); compared != 0 {
				return compared < 0
			}
			return members[left].subjectID < members[right].subjectID
		})
		if len(members) >= 2 {
			firstScore := scores[members[0]]
			secondScore := scores[members[1]]
			difference := firstScore - secondScore
			if difference < 0 {
				difference = -difference
			}
			if difference < 15 &&
				comparePartialDates(
					subjectByKey[members[0]].AirDate,
					subjectByKey[members[1]].AirDate,
				) > 0 {
				members[0], members[1] = members[1], members[0]
			}
		}
		ids := make([]int64, len(members))
		seriesID := members[0].subjectID
		for index, key := range members {
			ids[index] = key.subjectID
			if key.subjectID < seriesID {
				seriesID = key.subjectID
			}
		}
		record := componentRecord{
			seriesID:         seriesID,
			memberIDs:        ids,
			representativeID: ids[0],
		}
		subjectType := members[0].subjectType
		components[subjectType] = append(components[subjectType], record)
		for _, key := range members {
			bySubject[key] = record
		}
	}
	for subjectType := range components {
		sort.Slice(components[subjectType], func(left, right int) bool {
			return components[subjectType][left].seriesID < components[subjectType][right].seriesID
		})
	}
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return &SeriesIndex{
		dataVersion: dataVersion,
		bySubject:   bySubject,
		components:  components,
	}, nil
}

// DataVersion returns the immutable source identity.
func (s *SeriesIndex) DataVersion() string {
	if s == nil {
		return ""
	}
	return s.dataVersion
}

// ComponentFor returns a defensive copy of one component.
func (s *SeriesIndex) ComponentFor(subjectType string, subjectID int64) (Component, bool) {
	if s == nil {
		return Component{}, false
	}
	record, ok := s.bySubject[subjectKey{subjectType: subjectType, subjectID: subjectID}]
	if !ok {
		return Component{}, false
	}
	return publicComponent(record), true
}

// Components returns canonical defensive copies for one subject type.
func (s *SeriesIndex) Components(subjectType string) []Component {
	if s == nil {
		return nil
	}
	records := s.components[subjectType]
	result := make([]Component, len(records))
	for index, record := range records {
		result[index] = publicComponent(record)
	}
	return result
}

func publicComponent(record componentRecord) Component {
	return Component{
		SeriesID:         record.seriesID,
		MemberIDs:        cloneInt64(record.memberIDs),
		RepresentativeID: record.representativeID,
	}
}

func mergeRelation(relationID int64) bool {
	switch relationID {
	case 2, 3, 4, 5, 6, 9, 10, 11, 12:
		return true
	default:
		return false
	}
}

func sequelWeights(relationID int64, sameType bool) (int64, int64) {
	switch relationID {
	case 1, 3, 4, 6, 11:
		if sameType {
			return 5, -5
		}
	case 2, 5, 12:
		if sameType {
			return -5, 5
		}
	case 7, 8, 9, 10, 14, 99:
		return 1, 1
	}
	return 0, 0
}

func comparePartialDates(left, right *string) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return 1
	}
	if right == nil {
		return -1
	}
	return strings.Compare(*left, *right)
}

func keyLess(left, right subjectKey) bool {
	if left.subjectType != right.subjectType {
		return left.subjectType < right.subjectType
	}
	return left.subjectID < right.subjectID
}

func validSubjectType(value string) bool {
	switch value {
	case "book", "anime", "music", "game", "real":
		return true
	default:
		return false
	}
}

func validDataVersion(value string) bool {
	if len(value) != 68 || !strings.HasPrefix(value, "dv1-") {
		return false
	}
	for _, character := range value[4:] {
		if !(character >= '0' && character <= '9') &&
			!(character >= 'a' && character <= 'f') {
			return false
		}
	}
	return true
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
