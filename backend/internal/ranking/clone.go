package ranking

import "github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"

func cloneCore(value core) core {
	result := value
	result.Summary = cloneSummary(value.Summary)
	result.Rows = make([]rowCore, len(value.Rows))
	for index := range value.Rows {
		result.Rows[index] = cloneRow(value.Rows[index])
	}
	return result
}

func cloneRow(value rowCore) rowCore {
	value.Person = clonePerson(value.Person)
	value.Average = cloneInt64(value.Average)
	value.Overall = cloneInt64(value.Overall)
	value.Preference = clonePreference(value.Preference)
	return value
}

func clonePerson(value PersonReference) PersonReference {
	value.NameCN = cloneString(value.NameCN)
	return value
}

func clonePreference(value *Preference) *Preference {
	if value == nil {
		return nil
	}
	result := *value
	return &result
}

func cloneSummary(value Summary) Summary {
	value.CharacterCount = cloneInt(value.CharacterCount)
	return value
}

func cloneMetricScale(value MetricScale) MetricScale {
	switch maximum := value.Max.(type) {
	case statistics.Rational:
		value.Max = maximum
	case *statistics.Rational:
		if maximum == nil {
			value.Max = nil
		} else {
			copy := *maximum
			value.Max = copy
		}
	}
	return value
}

func cloneGlobalItems(values []GlobalItem) []GlobalItem {
	result := make([]GlobalItem, len(values))
	copy(result, values)
	for index := range result {
		result[index].Person = clonePerson(result[index].Person)
		result[index].Average = cloneInt64(result[index].Average)
		result[index].Overall = cloneInt64(result[index].Overall)
	}
	return result
}

func clonePersonalItems(values []PersonalItem) []PersonalItem {
	result := make([]PersonalItem, len(values))
	copy(result, values)
	for index := range result {
		result[index].Person = clonePerson(result[index].Person)
		result[index].Average = cloneInt64(result[index].Average)
		result[index].Overall = cloneInt64(result[index].Overall)
		result[index].Preference = clonePreference(result[index].Preference)
	}
	return result
}

func cloneCollectionFreshness(value CollectionFreshness) CollectionFreshness {
	value.WarningCodes = append([]string{}, value.WarningCodes...)
	return value
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt64(value *int64) *int64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
