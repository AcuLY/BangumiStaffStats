package archivebuild

import (
	"fmt"
	"testing"

	"go.yaml.in/yaml/v3"
)

func TestGovernedCatalogProducesAllCastScopes(t *testing.T) {
	compiled, err := compileGovernedCatalog(commonCatalog{}, canonicalCatalogConfig{})
	if err != nil {
		t.Fatal(err)
	}
	byKey := make(map[string]compiledPosition)
	for _, position := range compiled.Positions {
		byKey[position.PositionKey] = position
	}
	for _, subject := range []string{"anime", "game"} {
		for index, scope := range []string{"main", "supporting", "guest", "minor", "narrator", "voice-library", "all"} {
			key := "cast:" + subject + ":" + scope
			position, ok := byKey[key]
			label, rule := "声优", "1..6"
			if scope != "all" {
				label = "声优（" + []string{"主役", "配角", "客串", "闲角", "旁白", "声库"}[index] + "）"
				rule = fmt.Sprint(index + 1)
			}
			if !ok || position.Label != label || position.Names.CN != label || position.RuleValue != rule || position.RuleKind != "exactCast" || position.RuleKey != "exclusive:cast:"+subject || !position.Selectable {
				t.Fatalf("%s = %+v", key, position)
			}
		}
	}
}

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
