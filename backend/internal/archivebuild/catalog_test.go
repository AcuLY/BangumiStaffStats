package archivebuild

import (
	"testing"

	"go.yaml.in/yaml/v3"
)

func TestYAMLMappingValueResolvesAliasKeys(t *testing.T) {
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(`
define:
  type:
    anime: &TYPE_ANIME 2
  types:
    anime: &ANIME_STAFFS
      1: { en: Original, cn: 原作, jp: "" }
staffs:
  *TYPE_ANIME: *ANIME_STAFFS
`), &document); err != nil {
		t.Fatal(err)
	}
	root := document.Content[0]
	staffs := yamlMappingValue(root, "staffs")
	if value := yamlMappingValue(staffs, "2"); value == nil || value.Kind != yaml.AliasNode {
		t.Fatalf("alias-key mapping value = %#v", value)
	}
}
