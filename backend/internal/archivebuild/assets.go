package archivebuild

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"fmt"
)

//go:embed assets/schema.sql
var embeddedSchemaSQL []byte

//go:embed assets/display-v1.yaml
var embeddedDisplayYAML []byte

//go:embed assets/staff-sets-v1.yaml
var embeddedStaffSetsYAML []byte

type EmbeddedInputs struct {
	SchemaSQL           []byte
	DisplayYAML         []byte
	StaffSetsYAML       []byte
	SchemaSQLDigest     string
	CatalogConfig       []byte
	CatalogConfigDigest string
}

// LoadEmbeddedInputs returns defensive copies of the immutable producer
// inputs plus their semantic digests.
func LoadEmbeddedInputs() (EmbeddedInputs, error) {
	if len(embeddedSchemaSQL) == 0 || len(embeddedDisplayYAML) == 0 || len(embeddedStaffSetsYAML) == 0 {
		return EmbeddedInputs{}, failure("EMBEDDED_INPUT_INVALID", nil)
	}
	catalog, digest, err := canonicalCatalogConfiguration(embeddedDisplayYAML, embeddedStaffSetsYAML)
	if err != nil {
		return EmbeddedInputs{}, err
	}
	return EmbeddedInputs{
		SchemaSQL:           bytes.Clone(embeddedSchemaSQL),
		DisplayYAML:         bytes.Clone(embeddedDisplayYAML),
		StaffSetsYAML:       bytes.Clone(embeddedStaffSetsYAML),
		SchemaSQLDigest:     digestBytes(embeddedSchemaSQL),
		CatalogConfig:       catalog,
		CatalogConfigDigest: digest,
	}, nil
}

func digestBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return fmt.Sprintf("sha256:%x", sum)
}
