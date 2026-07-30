package persondetail

func cloneSlice[T any](values []T) []T {
	if values == nil {
		return nil
	}
	result := make([]T, len(values))
	copy(result, values)
	return result
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
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

func clonePersonReference(value PersonReference) PersonReference {
	value.NameCN = cloneString(value.NameCN)
	return value
}

func clonePersonProfile(value PersonProfile) PersonProfile {
	value.PersonReference = clonePersonReference(value.PersonReference)
	value.Careers = cloneSlice(value.Careers)
	value.Summary = cloneString(value.Summary)
	return value
}

func cloneSubjectReference(value SubjectReference) SubjectReference {
	value.NameCN = cloneString(value.NameCN)
	value.Date = cloneString(value.Date)
	return value
}

func cloneCharacterReference(value CharacterReference) CharacterReference {
	value.ID = cloneInt64(value.ID)
	value.NameCN = cloneString(value.NameCN)
	return value
}

func cloneMetrics(value Metrics) Metrics {
	value.Average = cloneInt64(value.Average)
	value.Overall = cloneInt64(value.Overall)
	value.GlobalAverage = cloneInt64(value.GlobalAverage)
	value.Highest = cloneInt64(value.Highest)
	value.Lowest = cloneInt64(value.Lowest)
	return value
}

func cloneTags(value Tags) Tags {
	value.Meta = cloneSlice(value.Meta)
	value.Community = cloneSlice(value.Community)
	if value.Personal != nil {
		value.Personal = cloneSlice(value.Personal)
	}
	return value
}

func cloneRatingExample(value RatingExample) RatingExample {
	value.NameCN = cloneString(value.NameCN)
	return value
}

func cloneRatingDistribution(value RatingDistribution) RatingDistribution {
	value.Average = cloneInt64(value.Average)
	value.Buckets = cloneSlice(value.Buckets)
	for index := range value.Buckets {
		value.Buckets[index].Examples = cloneSlice(value.Buckets[index].Examples)
		for exampleIndex := range value.Buckets[index].Examples {
			value.Buckets[index].Examples[exampleIndex] = cloneRatingExample(
				value.Buckets[index].Examples[exampleIndex],
			)
		}
	}
	value.Timeline = cloneSlice(value.Timeline)
	return value
}

func cloneRatings(value Ratings) Ratings {
	value.Global = cloneRatingDistribution(value.Global)
	if value.Personal != nil {
		personal := cloneRatingDistribution(*value.Personal)
		value.Personal = &personal
	}
	return value
}

func clonePreference(value *Preference) *Preference {
	if value == nil {
		return nil
	}
	result := *value
	if value.Mean != nil {
		mean := *value.Mean
		result.Mean = &mean
	}
	if value.Score != nil {
		score := *value.Score
		result.Score = &score
	}
	result.Preferred = cloneSlice(value.Preferred)
	result.Conservative = cloneSlice(value.Conservative)
	for index := range result.Preferred {
		result.Preferred[index].Unit = cloneRatingExample(result.Preferred[index].Unit)
	}
	for index := range result.Conservative {
		result.Conservative[index].Unit = cloneRatingExample(result.Conservative[index].Unit)
	}
	return &result
}

func cloneContribution(value Contribution) Contribution {
	if value.Staff != nil {
		staff := *value.Staff
		staff.WorkCount = cloneInt(staff.WorkCount)
		value.Staff = &staff
	}
	if value.Cast != nil {
		cast := *value.Cast
		cast.Character = cloneCharacterReference(cast.Character)
		cast.WorkCount = cloneInt(cast.WorkCount)
		value.Cast = &cast
	}
	return value
}

func cloneContributions(values []Contribution) []Contribution {
	result := cloneSlice(values)
	for index := range result {
		result[index] = cloneContribution(result[index])
	}
	return result
}

func cloneCollectionEvidence(value *CollectionEvidence) *CollectionEvidence {
	if value == nil {
		return nil
	}
	result := *value
	result.Score = cloneInt64(value.Score)
	result.UpdatedAt = cloneString(value.UpdatedAt)
	return &result
}

func cloneWorkItem(value WorkItem) WorkItem {
	if value.Subject != nil {
		subject := *value.Subject
		subject.Subject = cloneSubjectReference(subject.Subject)
		subject.MetaTags = cloneSlice(subject.MetaTags)
		subject.GlobalScore = cloneInt64(subject.GlobalScore)
		subject.Personal = cloneCollectionEvidence(subject.Personal)
		subject.Contributions = cloneContributions(subject.Contributions)
		value.Subject = &subject
	}
	if value.Series != nil {
		series := *value.Series
		series.Representative = cloneSubjectReference(series.Representative)
		series.Members = cloneSlice(series.Members)
		for index := range series.Members {
			series.Members[index].SubjectReference = cloneSubjectReference(
				series.Members[index].SubjectReference,
			)
		}
		series.GlobalScore = cloneInt64(series.GlobalScore)
		series.PersonalScore = cloneInt64(series.PersonalScore)
		series.LatestCollectionUpdatedAt = cloneString(series.LatestCollectionUpdatedAt)
		series.Contributions = cloneContributions(series.Contributions)
		value.Series = &series
	}
	return value
}

func cloneWorks(values []WorkItem) []WorkItem {
	result := cloneSlice(values)
	for index := range result {
		result[index] = cloneWorkItem(result[index])
	}
	return result
}

func cloneCharacterItem(value CharacterItem) CharacterItem {
	value.Character = cloneCharacterReference(value.Character)
	value.Appearances = cloneSlice(value.Appearances)
	for index := range value.Appearances {
		value.Appearances[index].Subject = cloneSubjectReference(
			value.Appearances[index].Subject,
		)
		value.Appearances[index].PositionKeys = cloneSlice(
			value.Appearances[index].PositionKeys,
		)
	}
	return value
}

func cloneCharacters(values []CharacterItem) []CharacterItem {
	result := cloneSlice(values)
	for index := range result {
		result[index] = cloneCharacterItem(result[index])
	}
	return result
}

// CloneCore transfers complete ownership across cache/request boundaries.
func CloneCore(value Core) Core {
	value.Person = clonePersonProfile(value.Person)
	value.Summary.CharacterCount = cloneInt(value.Summary.CharacterCount)
	value.Metrics = cloneMetrics(value.Metrics)
	value.Tags = cloneTags(value.Tags)
	value.Ratings = cloneRatings(value.Ratings)
	value.Preference = clonePreference(value.Preference)
	value.Works = cloneWorks(value.Works)
	value.Characters = cloneCharacters(value.Characters)
	return value
}
