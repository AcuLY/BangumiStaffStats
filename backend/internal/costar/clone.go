package costar

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

func clonePerson(value PersonReference) PersonReference {
	value.NameCN = cloneString(value.NameCN)
	return value
}

func cloneSubject(value SubjectReference) SubjectReference {
	value.NameCN = cloneString(value.NameCN)
	value.Date = cloneString(value.Date)
	return value
}

func cloneCharacter(value CharacterReference) CharacterReference {
	value.ID = cloneInt64(value.ID)
	value.NameCN = cloneString(value.NameCN)
	return value
}

func cloneMetrics(value Metrics) Metrics {
	value.Average = cloneInt64(value.Average)
	return value
}

func cloneParticipant(value ParticipantCore) ParticipantCore {
	value.Person = clonePerson(value.Person)
	value.PositionKeys = cloneSlice(value.PositionKeys)
	value.Metrics = cloneMetrics(value.Metrics)
	return value
}

func cloneSummary(value Summary) Summary {
	value.Average = cloneInt64(value.Average)
	value.GlobalRatedWorkCount = cloneInt(value.GlobalRatedWorkCount)
	value.GlobalAverage = cloneInt64(value.GlobalAverage)
	value.Highest = cloneInt64(value.Highest)
	value.Lowest = cloneInt64(value.Lowest)
	return value
}

func cloneTags(value Tags) Tags {
	value.Meta = cloneSlice(value.Meta)
	value.Community = cloneSlice(value.Community)
	value.Personal = cloneSlice(value.Personal)
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

func cloneDataset(value RatingDataset) RatingDataset {
	value.PersonID = cloneInt64(value.PersonID)
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
		result.Conservative[index].Unit = cloneRatingExample(
			result.Conservative[index].Unit,
		)
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
		cast.Character = cloneCharacter(cast.Character)
		cast.WorkCount = cloneInt(cast.WorkCount)
		value.Cast = &cast
	}
	return value
}

func cloneCredits(values []Contribution) []Contribution {
	result := cloneSlice(values)
	for index := range result {
		result[index] = cloneContribution(result[index])
	}
	return result
}

func cloneWorkParticipant(value WorkParticipant) WorkParticipant {
	value.WorkCount = cloneInt(value.WorkCount)
	value.Credits = cloneCredits(value.Credits)
	return value
}

func cloneCollectionEvidence(value *CollectionEvidence) *CollectionEvidence {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Score = cloneInt64(value.Score)
	copy.UpdatedAt = cloneString(value.UpdatedAt)
	return &copy
}

func cloneWork(value WorkItem) WorkItem {
	if value.Subject != nil {
		subject := *value.Subject
		subject.Subject = cloneSubject(subject.Subject)
		subject.MetaTags = cloneSlice(subject.MetaTags)
		subject.GlobalScore = cloneInt64(subject.GlobalScore)
		subject.Personal = cloneCollectionEvidence(subject.Personal)
		subject.Participants = cloneSlice(subject.Participants)
		for index := range subject.Participants {
			subject.Participants[index] = cloneWorkParticipant(subject.Participants[index])
		}
		value.Subject = &subject
	}
	if value.Series != nil {
		series := *value.Series
		series.Representative = cloneSubject(series.Representative)
		series.Members = cloneSlice(series.Members)
		for index := range series.Members {
			series.Members[index].SubjectReference = cloneSubject(
				series.Members[index].SubjectReference,
			)
		}
		series.GlobalScore = cloneInt64(series.GlobalScore)
		series.PersonalScore = cloneInt64(series.PersonalScore)
		series.LatestCollectionUpdatedAt = cloneString(series.LatestCollectionUpdatedAt)
		series.Participants = cloneSlice(series.Participants)
		for index := range series.Participants {
			series.Participants[index] = cloneWorkParticipant(series.Participants[index])
		}
		value.Series = &series
	}
	return value
}

func cloneWorks(values []WorkItem) []WorkItem {
	result := cloneSlice(values)
	for index := range result {
		result[index] = cloneWork(result[index])
	}
	return result
}

// CloneCore transfers deep ownership across cache/request boundaries.
func CloneCore(value Core) Core {
	value.Participants = cloneSlice(value.Participants)
	for index := range value.Participants {
		value.Participants[index] = cloneParticipant(value.Participants[index])
	}
	value.Summary = cloneSummary(value.Summary)
	value.Tags = cloneTags(value.Tags)
	value.Ratings = cloneSlice(value.Ratings)
	for index := range value.Ratings {
		value.Ratings[index] = cloneDataset(value.Ratings[index])
	}
	value.Preference = clonePreference(value.Preference)
	value.Matrix = cloneSlice(value.Matrix)
	for index := range value.Matrix {
		value.Matrix[index].Metrics = cloneMetrics(value.Matrix[index].Metrics)
	}
	value.Works = cloneWorks(value.Works)
	return value
}
