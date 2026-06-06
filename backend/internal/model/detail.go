package model

type SubjectDetail struct {
	ID             int                       `gorm:"column:subject_id"              json:"id"`
	Name           string                    `gorm:"column:subject_name"            json:"name"`
	NameCN         string                    `gorm:"column:subject_name_cn"         json:"nameCN"`
	Rate           float64                   `gorm:"column:subject_rate"            json:"rate"`
	Type           int                       `gorm:"column:subject_type"            json:"type"`
	Favorite       int                       `gorm:"column:subject_favorite"        json:"favorite"`
	Tags           StringSlice               `gorm:"column:subject_tags"            json:"tags,omitempty"`
	Date           Date                      `gorm:"column:subject_date"            json:"date,omitempty"`
	Image          string                    `gorm:"column:subject_image"           json:"image,omitempty"`
	NSFW           bool                      `gorm:"column:subject_nsfw"            json:"nsfw"`
	Infobox        string                    `gorm:"column:subject_infobox"         json:"infobox,omitempty"`
	Platform       int                       `gorm:"column:subject_platform"        json:"platform,omitempty"`
	Summary        string                    `gorm:"column:subject_summary"         json:"summary,omitempty"`
	ScoreDetails   JSONRaw                   `gorm:"column:subject_score_details"   json:"scoreDetails,omitempty"`
	Rank           int                       `gorm:"column:subject_rank"            json:"rank,omitempty"`
	MetaTags       JSONRaw                   `gorm:"column:subject_meta_tags"       json:"metaTags,omitempty"`
	FavoriteDetail JSONRaw                   `gorm:"column:subject_favorite_detail" json:"favoriteDetail,omitempty"`
	Series         bool                      `gorm:"column:subject_series"          json:"series"`
	Staff          []*CreditDetail           `gorm:"-" json:"staff,omitempty"`
	Characters     []*SubjectCharacterDetail `gorm:"-" json:"characters,omitempty"`
	SeriesSubjects []*Subject                `gorm:"-" json:"seriesSubjects,omitempty"`
}

type PersonDetail struct {
	ID       int                   `gorm:"column:person_id"       json:"id"`
	Name     string                `gorm:"column:person_name"     json:"name"`
	NameCN   string                `gorm:"column:person_name_cn"  json:"nameCN"`
	Type     int                   `gorm:"column:person_type"     json:"type,omitempty"`
	Career   JSONRaw               `gorm:"column:person_career"   json:"career,omitempty"`
	Infobox  string                `gorm:"column:person_infobox"  json:"infobox,omitempty"`
	Summary  string                `gorm:"column:person_summary"  json:"summary,omitempty"`
	Comments int                   `gorm:"column:person_comments" json:"comments,omitempty"`
	Collects int                   `gorm:"column:person_collects" json:"collects,omitempty"`
	Credits  []*PersonCreditDetail `gorm:"-" json:"credits,omitempty"`
	Casts    []*PersonCastDetail   `gorm:"-" json:"casts,omitempty"`
}

type CharacterDetail struct {
	ID       int                       `gorm:"column:character_id"       json:"id"`
	Name     string                    `gorm:"column:character_name"     json:"name"`
	NameCN   string                    `gorm:"column:character_name_cn"  json:"nameCN"`
	Image    string                    `gorm:"column:character_image"    json:"image,omitempty"`
	Role     int                       `gorm:"column:character_role"     json:"role,omitempty"`
	Infobox  string                    `gorm:"column:character_infobox"  json:"infobox,omitempty"`
	Summary  string                    `gorm:"column:character_summary"  json:"summary,omitempty"`
	Comments int                       `gorm:"column:character_comments" json:"comments,omitempty"`
	Collects int                       `gorm:"column:character_collects" json:"collects,omitempty"`
	Subjects []*CharacterSubjectDetail `gorm:"-" json:"subjects,omitempty"`
}

type CreditDetail struct {
	PositionID   int     `json:"positionId"`
	PositionName string  `json:"positionName"`
	Person       *Person `json:"person"`
}

type CastPersonDetail struct {
	PositionID   int     `json:"positionId"`
	PositionName string  `json:"positionName"`
	Person       *Person `json:"person"`
}

type SubjectCharacterDetail struct {
	Character *Character          `json:"character"`
	Type      int                 `json:"type"`
	Order     int                 `json:"order"`
	Casts     []*CastPersonDetail `json:"casts,omitempty"`
}

type PersonCreditDetail struct {
	PositionID   int      `json:"positionId"`
	PositionName string   `json:"positionName"`
	Subject      *Subject `json:"subject"`
}

type PersonCastDetail struct {
	PositionID   int        `json:"positionId"`
	PositionName string     `json:"positionName"`
	Subject      *Subject   `json:"subject"`
	Character    *Character `json:"character"`
}

type CharacterSubjectDetail struct {
	Subject *Subject            `json:"subject"`
	Type    int                 `json:"type"`
	Order   int                 `json:"order"`
	Casts   []*CastPersonDetail `json:"casts,omitempty"`
}
