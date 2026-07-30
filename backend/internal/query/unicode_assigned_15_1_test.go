package query

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"unicode"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

func TestUnicodeAuthorityFilesAndGeneratedAssignedTable(t *testing.T) {
	expectedHashes := map[string]string{
		"CaseFolding-15.1.0.txt":       "4e55acfdc32825a22e87670e9056a3bf94ad7c5400065778e9e10f8314372bcf",
		"DerivedAge-15.1.0.txt":        "04e16379344bdb9973cdb6f6bf0a5dd66f7cd41b014cd9f79d848768ae757256",
		"NormalizationTest-15.1.0.txt": "871238e37e3be0696ec2bd0891119a041b052da1a84485eda05a5438724b223e",
	}
	for filename, expectedHash := range expectedHashes {
		raw := readUnicodeAuthority(t, filename)
		sum := sha256.Sum256(raw)
		if got := hex.EncodeToString(sum[:]); got != expectedHash {
			t.Fatalf("%s sha256 = %s, want %s", filename, got, expectedHash)
		}
		header := string(raw[:min(len(raw), 4096)])
		if !strings.HasPrefix(header, "# "+filename+"\n") ||
			!strings.Contains(header, "Unicode") ||
			!strings.Contains(strings.ToLower(header), "terms of use") {
			t.Fatalf("%s does not retain the expected Unicode license/source header", filename)
		}
	}

	assigned := parseDerivedAgeAuthority(t, readUnicodeAuthority(t, "DerivedAge-15.1.0.txt"))
	for codePoint := rune(0); codePoint <= unicode.MaxRune; codePoint++ {
		got := unicode.Is(unicodeAssigned15_1, codePoint)
		want := assigned[codePoint]
		if got != want {
			t.Fatalf("generated assigned table drift at U+%04X: got %t, want %t", codePoint, got, want)
		}
	}
}

func TestUnicodeAssignedTableBinarySizeBudget(t *testing.T) {
	// Each Range16 is 6 bytes and each Range32 is 12 bytes in the compiled
	// table. The budget prevents accidentally embedding the 1.1-million-scalar
	// expansion instead of the compact pinned ranges.
	tableBytes := len(unicodeAssigned15_1.R16)*6 + len(unicodeAssigned15_1.R32)*12
	if tableBytes > 64*1024 {
		t.Fatalf("assigned table is %d bytes, exceeds 64 KiB budget", tableBytes)
	}
}

func TestUnicode151NFKCConformance(t *testing.T) {
	path := unicodeAuthorityPath("NormalizationTest-15.1.0.txt")
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	lineNumber := 0
	casesChecked := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(strings.SplitN(scanner.Text(), "#", 2)[0])
		if line == "" || strings.HasPrefix(line, "@") {
			continue
		}
		columns := strings.Split(line, ";")
		if len(columns) < 5 {
			t.Fatalf("line %d: expected five normalization columns", lineNumber)
		}
		values := make([]string, 5)
		for index := range values {
			values[index] = decodeCodePointSequence(t, columns[index])
		}
		for index, input := range values {
			if got, want := norm.NFKC.String(input), values[3]; got != want {
				t.Fatalf("line %d column %d: NFKC = %U, want %U", lineNumber, index+1, []rune(got), []rune(want))
			}
		}
		casesChecked++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if casesChecked == 0 {
		t.Fatal("normalization authority contained no cases")
	}
}

func TestUnicode151DefaultCaseFoldMappings(t *testing.T) {
	path := unicodeAuthorityPath("CaseFolding-15.1.0.txt")
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	mappings := make(map[rune]string)
	statuses := make(map[rune]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.SplitN(scanner.Text(), "#", 2)[0])
		if line == "" {
			continue
		}
		fields := strings.Split(line, ";")
		if len(fields) < 3 {
			t.Fatalf("invalid CaseFolding line %q", scanner.Text())
		}
		status := strings.TrimSpace(fields[1])
		if status != "C" && status != "F" {
			continue
		}
		sourceValue, err := strconv.ParseInt(strings.TrimSpace(fields[0]), 16, 32)
		if err != nil {
			t.Fatal(err)
		}
		source := rune(sourceValue)
		if status == "F" || statuses[source] != "F" {
			mappings[source] = decodeCodePointSequence(t, fields[2])
			statuses[source] = status
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	folder := cases.Fold()
	for source, expected := range mappings {
		if got := folder.String(string(source)); got != expected {
			t.Fatalf("default fold U+%04X = %U, want %U", source, []rune(got), []rune(expected))
		}
	}
}

func parseDerivedAgeAuthority(t *testing.T, raw []byte) []bool {
	t.Helper()
	assigned := make([]bool, unicode.MaxRune+1)
	scanner := bufio.NewScanner(strings.NewReader(string(raw)))
	for scanner.Scan() {
		line := strings.TrimSpace(strings.SplitN(scanner.Text(), "#", 2)[0])
		if line == "" || strings.HasPrefix(line, "@") {
			continue
		}
		fields := strings.Split(line, ";")
		if len(fields) != 2 {
			t.Fatalf("invalid DerivedAge line %q", scanner.Text())
		}
		version := strings.Split(strings.TrimSpace(fields[1]), ".")
		if len(version) != 2 {
			t.Fatalf("invalid DerivedAge version %q", fields[1])
		}
		major, _ := strconv.Atoi(version[0])
		minor, _ := strconv.Atoi(version[1])
		if major*100+minor > 1501 {
			continue
		}
		bounds := strings.Split(strings.TrimSpace(fields[0]), "..")
		start, err := strconv.ParseInt(bounds[0], 16, 32)
		if err != nil {
			t.Fatal(err)
		}
		end := start
		if len(bounds) == 2 {
			end, err = strconv.ParseInt(bounds[1], 16, 32)
			if err != nil {
				t.Fatal(err)
			}
		}
		for codePoint := start; codePoint <= end; codePoint++ {
			assigned[codePoint] = true
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return assigned
}

func decodeCodePointSequence(t *testing.T, value string) string {
	t.Helper()
	fields := strings.Fields(value)
	result := make([]rune, 0, len(fields))
	for _, field := range fields {
		codePoint, err := strconv.ParseInt(field, 16, 32)
		if err != nil {
			t.Fatalf("decode code point %q: %v", field, err)
		}
		result = append(result, rune(codePoint))
	}
	return string(result)
}

func readUnicodeAuthority(t *testing.T, filename string) []byte {
	t.Helper()
	raw, err := os.ReadFile(unicodeAuthorityPath(filename))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func unicodeAuthorityPath(filename string) string {
	return filepath.Join("..", "..", "..", "contracts", "goldens", "query", "unicode", filename)
}
