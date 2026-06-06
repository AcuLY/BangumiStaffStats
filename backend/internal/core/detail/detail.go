package detail

import (
	"context"
	"errors"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/position"
	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

var ErrNotFound = errors.New("detail not found")

type PersonPositionRow struct {
	PositionID   int    `gorm:"column:position_id"`
	PersonID     int    `gorm:"column:person_id"`
	PersonName   string `gorm:"column:person_name"`
	PersonNameCN string `gorm:"column:person_name_cn"`
}

type CharacterRow struct {
	CharacterID     int    `gorm:"column:character_id"`
	CharacterName   string `gorm:"column:character_name"`
	CharacterNameCN string `gorm:"column:character_name_cn"`
	CharacterImage  string `gorm:"column:character_image"`
}

type SubjectRow struct {
	SubjectID       int           `gorm:"column:subject_id"`
	SubjectName     string        `gorm:"column:subject_name"`
	SubjectNameCN   string        `gorm:"column:subject_name_cn"`
	SubjectRate     float64       `gorm:"column:subject_rate"`
	SubjectImage    string        `gorm:"column:subject_image"`
	SubjectFavorite int           `gorm:"column:subject_favorite"`
	SubjectTags     m.StringSlice `gorm:"column:subject_tags"`
	SubjectDate     m.Date        `gorm:"column:subject_date"`
	SubjectNSFW     bool          `gorm:"column:subject_nsfw"`
}

type subjectPositionRow struct {
	PositionID int `gorm:"column:position_id"`
	SubjectRow `gorm:"embedded"`
}

type subjectCharacterRow struct {
	CharacterType int `gorm:"column:character_type"`
	SortOrder     int `gorm:"column:sort_order"`
	CharacterRow  `gorm:"embedded"`
}

type personCastRow struct {
	PositionID   int `gorm:"column:position_id"`
	SubjectRow   `gorm:"embedded"`
	CharacterRow `gorm:"embedded"`
}

type characterSubjectRow struct {
	CharacterType int `gorm:"column:character_type"`
	SortOrder     int `gorm:"column:sort_order"`
	SubjectRow    `gorm:"embedded"`
}

func Subject(ctx context.Context, id int) (*m.SubjectDetail, error) {
	details, err := store.DBRaw[*m.SubjectDetail](ctx, "SELECT * FROM subjects WHERE subject_id = ?", id)
	if err != nil {
		return nil, err
	}
	if len(details) == 0 {
		return nil, ErrNotFound
	}

	detail := details[0]
	staff, err := subjectStaff(ctx, id)
	if err != nil {
		return nil, err
	}
	characters, err := subjectCharacters(ctx, id)
	if err != nil {
		return nil, err
	}
	seriesSubjects, err := subjectSeries(ctx, id)
	if err != nil {
		return nil, err
	}

	detail.Staff = staff
	detail.Characters = characters
	detail.SeriesSubjects = seriesSubjects
	return detail, nil
}

func Person(ctx context.Context, id int) (*m.PersonDetail, error) {
	details, err := store.DBRaw[*m.PersonDetail](ctx, "SELECT * FROM people WHERE person_id = ?", id)
	if err != nil {
		return nil, err
	}
	if len(details) == 0 {
		return nil, ErrNotFound
	}

	credits, err := personCredits(ctx, id)
	if err != nil {
		return nil, err
	}
	casts, err := personCasts(ctx, id)
	if err != nil {
		return nil, err
	}

	detail := details[0]
	detail.Credits = credits
	detail.Casts = casts
	return detail, nil
}

func Character(ctx context.Context, id int) (*m.CharacterDetail, error) {
	details, err := store.DBRaw[*m.CharacterDetail](ctx, "SELECT * FROM characters WHERE character_id = ?", id)
	if err != nil {
		return nil, err
	}
	if len(details) == 0 {
		return nil, ErrNotFound
	}

	subjects, err := characterSubjects(ctx, id)
	if err != nil {
		return nil, err
	}

	detail := details[0]
	detail.Subjects = subjects
	return detail, nil
}

func subjectStaff(ctx context.Context, id int) ([]*m.CreditDetail, error) {
	rows, err := store.DBRaw[PersonPositionRow](ctx, `
		SELECT c.position_id, p.person_id, p.person_name, p.person_name_cn
		FROM credits c
		JOIN people p ON p.person_id = c.person_id
		WHERE c.subject_id = ?
		ORDER BY c.position_id, p.person_name
	`, id)
	if err != nil {
		return nil, err
	}

	staff := make([]*m.CreditDetail, 0, len(rows))
	for _, row := range rows {
		staff = append(staff, &m.CreditDetail{
			PositionID:   row.PositionID,
			PositionName: position.PositionName(row.PositionID),
			Person:       row.toPerson(),
		})
	}
	return staff, nil
}

func subjectCharacters(ctx context.Context, id int) ([]*m.SubjectCharacterDetail, error) {
	rows, err := store.DBRaw[subjectCharacterRow](ctx, `
		SELECT sc.character_type, sc.sort_order,
		       ch.character_id, ch.character_name, ch.character_name_cn, ch.character_image
		FROM subject_characters sc
		JOIN characters ch ON ch.character_id = sc.character_id
		WHERE sc.subject_id = ?
		ORDER BY sc.sort_order, sc.character_type
	`, id)
	if err != nil {
		return nil, err
	}

	casts, err := subjectCastMap(ctx, id)
	if err != nil {
		return nil, err
	}

	characters := make([]*m.SubjectCharacterDetail, 0, len(rows))
	for _, row := range rows {
		character := row.toCharacter()
		characters = append(characters, &m.SubjectCharacterDetail{
			Character: character,
			Type:      row.CharacterType,
			Order:     row.SortOrder,
			Casts:     casts[character.ID],
		})
	}
	return characters, nil
}

func subjectCastMap(ctx context.Context, id int) (map[int][]*m.CastPersonDetail, error) {
	rows, err := store.DBRaw[struct {
		CharacterID       int `gorm:"column:character_id"`
		PersonPositionRow `gorm:"embedded"`
	}](ctx, `
		SELECT c.character_id, c.position_id, p.person_id, p.person_name, p.person_name_cn
		FROM casts c
		JOIN people p ON p.person_id = c.person_id
		WHERE c.subject_id = ?
		ORDER BY c.character_id, c.position_id, p.person_name
	`, id)
	if err != nil {
		return nil, err
	}

	casts := make(map[int][]*m.CastPersonDetail)
	for _, row := range rows {
		casts[row.CharacterID] = append(casts[row.CharacterID], &m.CastPersonDetail{
			PositionID:   row.PositionID,
			PositionName: position.PositionName(row.PositionID),
			Person:       row.toPerson(),
		})
	}
	return casts, nil
}

func subjectSeries(ctx context.Context, id int) ([]*m.Subject, error) {
	rows, err := store.DBRaw[SubjectRow](ctx, `
		SELECT s.subject_id, s.subject_name, s.subject_name_cn, s.subject_rate,
		       s.subject_image, s.subject_favorite, s.subject_tags, s.subject_date, s.subject_nsfw
		FROM sequels current
		JOIN sequels seq ON seq.series_id = current.series_id
		JOIN subjects s ON s.subject_id = seq.subject_id
		WHERE current.subject_id = ?
		ORDER BY seq.sequel_order, s.subject_id
	`, id)
	if err != nil {
		return nil, err
	}

	subjects := make([]*m.Subject, 0, len(rows))
	for _, row := range rows {
		subjects = append(subjects, row.toSubject())
	}
	return subjects, nil
}

func personCredits(ctx context.Context, id int) ([]*m.PersonCreditDetail, error) {
	rows, err := store.DBRaw[subjectPositionRow](ctx, `
		SELECT c.position_id,
		       s.subject_id, s.subject_name, s.subject_name_cn, s.subject_rate,
		       s.subject_image, s.subject_favorite, s.subject_tags, s.subject_date, s.subject_nsfw
		FROM credits c
		JOIN subjects s ON s.subject_id = c.subject_id
		WHERE c.person_id = ?
		ORDER BY s.subject_date DESC, s.subject_id DESC, c.position_id
	`, id)
	if err != nil {
		return nil, err
	}

	credits := make([]*m.PersonCreditDetail, 0, len(rows))
	for _, row := range rows {
		credits = append(credits, &m.PersonCreditDetail{
			PositionID:   row.PositionID,
			PositionName: position.PositionName(row.PositionID),
			Subject:      row.toSubject(),
		})
	}
	return credits, nil
}

func personCasts(ctx context.Context, id int) ([]*m.PersonCastDetail, error) {
	rows, err := store.DBRaw[personCastRow](ctx, `
		SELECT c.position_id,
		       s.subject_id, s.subject_name, s.subject_name_cn, s.subject_rate,
		       s.subject_image, s.subject_favorite, s.subject_tags, s.subject_date, s.subject_nsfw,
		       ch.character_id, ch.character_name, ch.character_name_cn, ch.character_image
		FROM casts c
		JOIN subjects s ON s.subject_id = c.subject_id
		JOIN characters ch ON ch.character_id = c.character_id
		WHERE c.person_id = ?
		ORDER BY s.subject_date DESC, s.subject_id DESC, ch.character_name
	`, id)
	if err != nil {
		return nil, err
	}

	casts := make([]*m.PersonCastDetail, 0, len(rows))
	for _, row := range rows {
		casts = append(casts, &m.PersonCastDetail{
			PositionID:   row.PositionID,
			PositionName: position.PositionName(row.PositionID),
			Subject:      row.toSubject(),
			Character:    row.toCharacter(),
		})
	}
	return casts, nil
}

func characterSubjects(ctx context.Context, id int) ([]*m.CharacterSubjectDetail, error) {
	rows, err := store.DBRaw[characterSubjectRow](ctx, `
		SELECT sc.character_type, sc.sort_order,
		       s.subject_id, s.subject_name, s.subject_name_cn, s.subject_rate,
		       s.subject_image, s.subject_favorite, s.subject_tags, s.subject_date, s.subject_nsfw
		FROM subject_characters sc
		JOIN subjects s ON s.subject_id = sc.subject_id
		WHERE sc.character_id = ?
		ORDER BY s.subject_date DESC, s.subject_id DESC
	`, id)
	if err != nil {
		return nil, err
	}

	casts, err := characterCastMap(ctx, id)
	if err != nil {
		return nil, err
	}

	subjects := make([]*m.CharacterSubjectDetail, 0, len(rows))
	for _, row := range rows {
		subject := row.toSubject()
		subjects = append(subjects, &m.CharacterSubjectDetail{
			Subject: subject,
			Type:    row.CharacterType,
			Order:   row.SortOrder,
			Casts:   casts[subject.ID],
		})
	}
	return subjects, nil
}

func characterCastMap(ctx context.Context, id int) (map[int][]*m.CastPersonDetail, error) {
	rows, err := store.DBRaw[struct {
		SubjectID         int `gorm:"column:subject_id"`
		PersonPositionRow `gorm:"embedded"`
	}](ctx, `
		SELECT c.subject_id, c.position_id, p.person_id, p.person_name, p.person_name_cn
		FROM casts c
		JOIN people p ON p.person_id = c.person_id
		WHERE c.character_id = ?
		ORDER BY c.subject_id, c.position_id, p.person_name
	`, id)
	if err != nil {
		return nil, err
	}

	casts := make(map[int][]*m.CastPersonDetail)
	for _, row := range rows {
		casts[row.SubjectID] = append(casts[row.SubjectID], &m.CastPersonDetail{
			PositionID:   row.PositionID,
			PositionName: position.PositionName(row.PositionID),
			Person:       row.toPerson(),
		})
	}
	return casts, nil
}

func (r PersonPositionRow) toPerson() *m.Person {
	return &m.Person{
		ID:     r.PersonID,
		Name:   r.PersonName,
		NameCN: r.PersonNameCN,
	}
}

func (r CharacterRow) toCharacter() *m.Character {
	return &m.Character{
		ID:     r.CharacterID,
		Name:   r.CharacterName,
		NameCN: r.CharacterNameCN,
		Image:  r.CharacterImage,
	}
}

func (r SubjectRow) toSubject() *m.Subject {
	return &m.Subject{
		ID:       r.SubjectID,
		Name:     r.SubjectName,
		NameCN:   r.SubjectNameCN,
		Rate:     r.SubjectRate,
		Image:    r.SubjectImage,
		Favorite: r.SubjectFavorite,
		Tags:     r.SubjectTags,
		Date:     r.SubjectDate,
		NSFW:     r.SubjectNSFW,
	}
}
