PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;
PRAGMA application_id = 1111969107;
PRAGMA user_version = 1;

CREATE TABLE archive_meta (
  singleton INTEGER NOT NULL PRIMARY KEY CHECK (singleton = 1),
  data_version TEXT NOT NULL CHECK (
    length(data_version) = 68
    AND substr(data_version, 1, 4) = 'dv1-'
    AND substr(data_version, 5) NOT GLOB '*[^0-9a-f]*'
  ),
  manifest_schema_version INTEGER NOT NULL CHECK (manifest_schema_version = 1),
  sqlite_schema_version INTEGER NOT NULL CHECK (sqlite_schema_version = 1),
  data_version_algorithm TEXT NOT NULL CHECK (data_version_algorithm = 'bgmss-archive-data-version-v1'),
  domain_rules_version TEXT NOT NULL CHECK (length(domain_rules_version) BETWEEN 1 AND 128),
  cast_rules_version TEXT NOT NULL CHECK (length(cast_rules_version) BETWEEN 1 AND 128),
  catalog_config_digest TEXT NOT NULL CHECK (
    length(catalog_config_digest) = 71
    AND substr(catalog_config_digest, 1, 7) = 'sha256:'
    AND substr(catalog_config_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
) STRICT;

CREATE TABLE subject (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  subject_id INTEGER NOT NULL CHECK (subject_id > 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 4096),
  name_cn TEXT CHECK (name_cn IS NULL OR length(name_cn) BETWEEN 1 AND 4096),
  nsfw INTEGER NOT NULL CHECK (nsfw IN (0, 1)),
  air_date TEXT,
  air_date_precision INTEGER,
  score REAL CHECK (score IS NULL OR score BETWEEN 0.0 AND 10.0),
  votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
  PRIMARY KEY (subject_type, subject_id),
  CHECK (
    (air_date IS NULL AND air_date_precision IS NULL)
    OR (
      air_date IS NOT NULL
      AND air_date_precision IS NOT NULL
      AND instr(air_date, char(0)) = 0
      AND (
        (
          air_date_precision = 1
          AND length(air_date) = 4
          AND air_date GLOB '[0-9][0-9][0-9][0-9]'
        )
        OR (
          air_date_precision = 2
          AND length(air_date) = 7
          AND air_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        )
        OR (
          air_date_precision = 3
          AND length(air_date) = 10
          AND air_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        )
      )
      AND CAST(substr(air_date, 1, 4) AS INTEGER) BETWEEN 1 AND 9999
      AND (
        air_date_precision = 1
        OR CAST(substr(air_date, 6, 2) AS INTEGER) BETWEEN 1 AND 12
      )
      AND (
        air_date_precision IN (1, 2)
        OR CAST(substr(air_date, 9, 2) AS INTEGER) BETWEEN 1 AND
          CASE CAST(substr(air_date, 6, 2) AS INTEGER)
            WHEN 1 THEN 31
            WHEN 2 THEN
              CASE
                WHEN (
                  CAST(substr(air_date, 1, 4) AS INTEGER) % 400 = 0
                  OR (
                    CAST(substr(air_date, 1, 4) AS INTEGER) % 4 = 0
                    AND CAST(substr(air_date, 1, 4) AS INTEGER) % 100 <> 0
                  )
                ) THEN 29
                ELSE 28
              END
            WHEN 3 THEN 31
            WHEN 4 THEN 30
            WHEN 5 THEN 31
            WHEN 6 THEN 30
            WHEN 7 THEN 31
            WHEN 8 THEN 31
            WHEN 9 THEN 30
            WHEN 10 THEN 31
            WHEN 11 THEN 30
            WHEN 12 THEN 31
          END
      )
    )
  )
) STRICT;

CREATE TABLE subject_rating_bucket (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  vote_count INTEGER NOT NULL CHECK (vote_count >= 0),
  PRIMARY KEY (subject_type, subject_id, rating),
  FOREIGN KEY (subject_type, subject_id) REFERENCES subject (subject_type, subject_id)
) STRICT;

CREATE TABLE subject_tag (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  tag_scope TEXT NOT NULL CHECK (tag_scope IN ('public', 'meta')),
  tag_name TEXT NOT NULL CHECK (length(tag_name) BETWEEN 1 AND 255),
  PRIMARY KEY (subject_type, subject_id, tag_scope, tag_name),
  FOREIGN KEY (subject_type, subject_id) REFERENCES subject (subject_type, subject_id)
) STRICT;

CREATE TABLE person (
  person_id INTEGER NOT NULL PRIMARY KEY CHECK (person_id > 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 4096),
  name_cn TEXT CHECK (name_cn IS NULL OR length(name_cn) BETWEEN 1 AND 4096),
  name_jp TEXT CHECK (name_jp IS NULL OR length(name_jp) BETWEEN 1 AND 4096)
) STRICT;

CREATE TABLE person_career (
  person_id INTEGER NOT NULL,
  career TEXT NOT NULL CHECK (career IN ('producer', 'mangaka', 'artist', 'seiyu', 'writer', 'illustrator', 'actor')),
  PRIMARY KEY (person_id, career),
  FOREIGN KEY (person_id) REFERENCES person (person_id)
) STRICT;

CREATE TABLE character (
  character_id INTEGER NOT NULL PRIMARY KEY CHECK (character_id > 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 4096),
  name_cn TEXT CHECK (name_cn IS NULL OR length(name_cn) BETWEEN 1 AND 4096)
) STRICT;

CREATE TABLE subject_relation (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  related_subject_type TEXT NOT NULL CHECK (related_subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  related_subject_id INTEGER NOT NULL CHECK (related_subject_id > 0),
  relation_type INTEGER NOT NULL CHECK (
    relation_type > 0
    AND relation_type <= 9007199254740991
  ),
  PRIMARY KEY (subject_type, subject_id, related_subject_type, related_subject_id, relation_type),
  FOREIGN KEY (subject_type, subject_id) REFERENCES subject (subject_type, subject_id),
  FOREIGN KEY (related_subject_type, related_subject_id) REFERENCES subject (subject_type, subject_id)
) STRICT;

CREATE TABLE staff_position_category (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  category_key TEXT NOT NULL CHECK (length(category_key) BETWEEN 1 AND 64),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (subject_type, category_key)
) STRICT;

CREATE TABLE staff_position (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  position_id INTEGER NOT NULL CHECK (position_id > 0),
  name_cn TEXT CHECK (name_cn IS NULL OR length(name_cn) BETWEEN 1 AND 255),
  name_en TEXT CHECK (name_en IS NULL OR length(name_en) BETWEEN 1 AND 255),
  name_jp TEXT CHECK (name_jp IS NULL OR length(name_jp) BETWEEN 1 AND 255),
  categories TEXT NOT NULL CHECK (json_valid(categories) AND json_type(categories) = 'array'),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  status TEXT NOT NULL CHECK (status IN ('selectable', 'hidden')),
  common_commit TEXT NOT NULL CHECK (
    length(common_commit) = 40
    AND common_commit NOT GLOB '*[^0-9a-f]*'
  ),
  PRIMARY KEY (subject_type, position_id)
) STRICT;

CREATE TABLE staff_credit (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  position_id INTEGER NOT NULL CHECK (position_id > 0),
  PRIMARY KEY (subject_type, subject_id, person_id, position_id),
  FOREIGN KEY (subject_type, subject_id) REFERENCES subject (subject_type, subject_id),
  FOREIGN KEY (person_id) REFERENCES person (person_id)
) STRICT;

CREATE TABLE cast_credit (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  role_type INTEGER NOT NULL CHECK (role_type BETWEEN 1 AND 6),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  eligible INTEGER NOT NULL CHECK (eligible = 1),
  provenance TEXT NOT NULL CHECK (provenance = 'exact'),
  PRIMARY KEY (subject_type, subject_id, person_id, character_id),
  FOREIGN KEY (subject_type, subject_id) REFERENCES subject (subject_type, subject_id),
  FOREIGN KEY (person_id) REFERENCES person (person_id),
  FOREIGN KEY (character_id) REFERENCES character (character_id)
) STRICT;

CREATE TABLE staff_set (
  set_key TEXT NOT NULL PRIMARY KEY CHECK (
    length(set_key) BETWEEN 15 AND 96
    AND set_key GLOB 'staffset:*:*'
  ),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255),
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  UNIQUE (set_key, subject_type)
) STRICT;

CREATE TABLE staff_set_member (
  set_key TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  position_id INTEGER NOT NULL,
  PRIMARY KEY (set_key, position_id),
  FOREIGN KEY (set_key, subject_type) REFERENCES staff_set (set_key, subject_type),
  FOREIGN KEY (subject_type, position_id) REFERENCES staff_position (subject_type, position_id)
) STRICT;

CREATE TABLE catalog_position (
  position_key TEXT NOT NULL PRIMARY KEY CHECK (length(position_key) BETWEEN 1 AND 96),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  position_kind TEXT NOT NULL CHECK (position_kind IN ('staff', 'cast', 'staffSet')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255),
  name_cn TEXT CHECK (name_cn IS NULL OR length(name_cn) BETWEEN 1 AND 255),
  name_en TEXT CHECK (name_en IS NULL OR length(name_en) BETWEEN 1 AND 255),
  name_jp TEXT CHECK (name_jp IS NULL OR length(name_jp) BETWEEN 1 AND 255),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  selectable INTEGER NOT NULL CHECK (selectable IN (0, 1))
) STRICT;

CREATE TABLE catalog_position_member (
  position_key TEXT NOT NULL,
  member_key TEXT NOT NULL,
  PRIMARY KEY (position_key, member_key),
  FOREIGN KEY (position_key) REFERENCES catalog_position (position_key),
  FOREIGN KEY (member_key) REFERENCES catalog_position (position_key),
  CHECK (position_key <> member_key)
) STRICT;

CREATE TABLE catalog_group (
  group_key TEXT NOT NULL PRIMARY KEY CHECK (length(group_key) BETWEEN 1 AND 96),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'anime', 'music', 'game', 'real')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255),
  display_order INTEGER NOT NULL CHECK (display_order >= 0)
) STRICT;

CREATE TABLE catalog_group_member (
  group_key TEXT NOT NULL,
  position_key TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (group_key, position_key),
  FOREIGN KEY (group_key) REFERENCES catalog_group (group_key),
  FOREIGN KEY (position_key) REFERENCES catalog_position (position_key)
) STRICT;

CREATE TABLE catalog_capability (
  position_key TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('rankings', 'candidates', 'personDetail', 'partners', 'coStar')),
  supported INTEGER NOT NULL CHECK (supported IN (0, 1)),
  PRIMARY KEY (position_key, capability),
  FOREIGN KEY (position_key) REFERENCES catalog_position (position_key)
) STRICT;

CREATE TABLE catalog_selection_rule (
  rule_key TEXT NOT NULL,
  position_key TEXT NOT NULL,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('exactStaff', 'exactCast', 'staffSetUnion')),
  rule_value TEXT NOT NULL CHECK (length(rule_value) BETWEEN 1 AND 255),
  PRIMARY KEY (rule_key, position_key),
  FOREIGN KEY (position_key) REFERENCES catalog_position (position_key)
) STRICT;

CREATE INDEX idx_subject_filter_date_id
  ON subject (subject_type, nsfw, air_date_precision, air_date, subject_id);
CREATE INDEX idx_subject_relation_source
  ON subject_relation (subject_type, subject_id, relation_type, related_subject_id);
CREATE INDEX idx_subject_tag_lookup
  ON subject_tag (subject_type, tag_scope, tag_name, subject_id);
CREATE INDEX idx_person_career_lookup
  ON person_career (career, person_id);
CREATE INDEX idx_staff_position_category_lookup
  ON staff_position (subject_type, sort_order, position_id);
CREATE INDEX idx_staff_credit_lookup
  ON staff_credit (subject_type, position_id, person_id, subject_id);
CREATE INDEX idx_cast_credit_role_lookup
  ON cast_credit (subject_type, role_type, person_id, subject_id);
CREATE INDEX idx_cast_credit_character_lookup
  ON cast_credit (subject_type, person_id, subject_id, character_id);
CREATE INDEX idx_staff_set_member_lookup
  ON staff_set_member (set_key, position_id);
CREATE INDEX idx_catalog_position_order
  ON catalog_position (subject_type, position_kind, display_order, position_key);
CREATE INDEX idx_catalog_position_member_lookup
  ON catalog_position_member (position_key, member_key);
CREATE INDEX idx_catalog_group_order
  ON catalog_group (subject_type, display_order, group_key);
CREATE INDEX idx_catalog_group_member_lookup
  ON catalog_group_member (group_key, display_order, position_key);
CREATE INDEX idx_catalog_capability_lookup
  ON catalog_capability (capability, supported, position_key);
CREATE INDEX idx_catalog_selection_rule_lookup
  ON catalog_selection_rule (rule_kind, position_key, rule_key);
