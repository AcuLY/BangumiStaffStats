package architecture

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

const modulePath = "github.com/AcuLY/BangumiStaffStats/backend"

type listedPackage struct {
	ImportPath string
	Name       string
	Dir        string
	GoFiles    []string
	CgoFiles   []string
	Imports    []string
	Error      *listError
	DepsErrors []listError
}

type listError struct {
	Err string
}

func TestProductionPackageDependencies(t *testing.T) {
	moduleRoot := findModuleRoot(t)
	packages := listPackages(t, moduleRoot)

	allowedInternalImports := map[string][]string{
		modulePath + "/cmd/api":                       {modulePath + "/internal/app"},
		modulePath + "/cmd/archive-smoke":             {modulePath + "/internal/archive"},
		modulePath + "/internal/app":                  {modulePath + "/internal/archive", modulePath + "/internal/httpapi", modulePath + "/internal/ranking"},
		modulePath + "/internal/catalog":              {modulePath + "/internal/archive", modulePath + "/internal/httpapi/wire"},
		modulePath + "/internal/httpapi":              {modulePath + "/internal/archive", modulePath + "/internal/catalog", modulePath + "/internal/httpapi/wire", modulePath + "/internal/imageproxy", modulePath + "/internal/observability", modulePath + "/internal/ranking"},
		modulePath + "/internal/httpapi/wire":         {},
		modulePath + "/internal/imageproxy":           {},
		modulePath + "/internal/observability":        {},
		modulePath + "/internal/query":                {modulePath + "/internal/archive"},
		modulePath + "/internal/ranking":              {modulePath + "/internal/archive", modulePath + "/internal/query", modulePath + "/internal/runtimecache", modulePath + "/internal/statistics"},
		modulePath + "/internal/runtimecache":         {},
		modulePath + "/internal/statistics":           {modulePath + "/internal/archive", modulePath + "/internal/query"},
		modulePath + "/internal/archive":              {},
		modulePath + "/internal/archive/contracttest": {},
		modulePath + "/internal/cache":                {},
		modulePath + "/internal/collection":           {},
		modulePath + "/internal/architecture":         {},
	}

	for _, pkg := range packages {
		if pkg.Error != nil {
			t.Errorf("%s: go list error: %s", pkg.ImportPath, pkg.Error.Err)
		}
		for _, dependencyError := range pkg.DepsErrors {
			t.Errorf("%s: dependency error: %s", pkg.ImportPath, dependencyError.Err)
		}
		if pkg.ImportPath != modulePath && !strings.HasPrefix(pkg.ImportPath, modulePath+"/") {
			t.Errorf("package outside module: %s", pkg.ImportPath)
			continue
		}
		if !pathWithin(moduleRoot, pkg.Dir) {
			t.Errorf("package %s resolves outside module: %s", pkg.ImportPath, pkg.Dir)
		}
		if _, known := allowedInternalImports[pkg.ImportPath]; !known {
			t.Errorf("unapproved production package: %s", pkg.ImportPath)
		}
		assertNoWorkbenchName(t, pkg)

		for _, imported := range pkg.Imports {
			if !strings.HasPrefix(imported, modulePath+"/") {
				if strings.Contains(imported, ".") {
					wireRuntime := pkg.ImportPath == modulePath+"/internal/httpapi/wire" &&
						imported == "github.com/oapi-codegen/runtime"
					archiveSQLite := pkg.ImportPath == modulePath+"/internal/archive" &&
						(imported == "modernc.org/sqlite" || imported == "modernc.org/sqlite/vfs")
					queryNormalization := pkg.ImportPath == modulePath+"/internal/query" &&
						(imported == "github.com/gowebpki/jcs" ||
							strings.HasPrefix(imported, "golang.org/x/text/"))
					rankingNormalization := pkg.ImportPath == modulePath+"/internal/ranking" &&
						strings.HasPrefix(imported, "golang.org/x/text/")
					runtimeCache := pkg.ImportPath == modulePath+"/internal/runtimecache" &&
						imported == "golang.org/x/sync/singleflight"
					if !wireRuntime && !archiveSQLite && !queryNormalization && !rankingNormalization && !runtimeCache {
						t.Errorf("%s imports unapproved production dependency %s", pkg.ImportPath, imported)
					}
				}
				continue
			}
			if !slices.Contains(allowedInternalImports[pkg.ImportPath], imported) {
				t.Errorf("forbidden package edge: %s -> %s", pkg.ImportPath, imported)
			}
		}
	}
}

func TestPinnedModuleDeclaration(t *testing.T) {
	moduleRoot := findModuleRoot(t)
	command := exec.Command("go", "mod", "edit", "-json")
	command.Dir = moduleRoot
	output, err := command.Output()
	if err != nil {
		t.Fatalf("go mod edit -json: %v", err)
	}

	var module struct {
		Module struct {
			Path string
		}
		Go        string
		Toolchain string
		Require   []struct {
			Path     string
			Version  string
			Indirect bool
		}
		Tool []struct {
			Path string
		}
	}
	if err := json.Unmarshal(output, &module); err != nil {
		t.Fatalf("decode go.mod metadata: %v", err)
	}
	if module.Module.Path != modulePath {
		t.Errorf("module path = %q, want %q", module.Module.Path, modulePath)
	}
	if module.Go != "1.26.0" {
		t.Errorf("go version = %q, want 1.26.0", module.Go)
	}
	if module.Toolchain != "go1.26.5" {
		t.Errorf("toolchain = %q, want go1.26.5", module.Toolchain)
	}
	if len(module.Tool) != 1 || module.Tool[0].Path != "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen" {
		t.Errorf("unexpected tool declarations: %+v", module.Tool)
	}

	direct := make(map[string]string)
	for _, requirement := range module.Require {
		if !requirement.Indirect {
			direct[requirement.Path] = requirement.Version
		}
		if requirement.Path == "github.com/oapi-codegen/oapi-codegen/v2" && requirement.Version != "v2.8.0" {
			t.Errorf("oapi-codegen version = %q, want v2.8.0", requirement.Version)
		}
	}
	wantDirect := map[string]string{
		"github.com/oapi-codegen/runtime": "v1.1.2",
		"github.com/gowebpki/jcs":         "v1.0.1",
		"golang.org/x/sync":               "v0.22.0",
		"golang.org/x/text":               "v0.40.0",
		"modernc.org/sqlite":              "v1.54.0",
	}
	if !mapsEqual(direct, wantDirect) {
		t.Errorf("direct runtime requirements = %+v, want %+v", direct, wantDirect)
	}
	libcVersion := ""
	for _, requirement := range module.Require {
		if requirement.Path == "modernc.org/libc" {
			libcVersion = requirement.Version
			if !requirement.Indirect {
				t.Error("modernc.org/libc must remain a resolved indirect dependency")
			}
		}
	}
	if libcVersion != "v1.74.1" {
		t.Errorf("modernc.org/libc version = %q, want v1.74.1", libcVersion)
	}
}

func TestRuntimeHasExactApprovedRoutes(t *testing.T) {
	moduleRoot := findModuleRoot(t)
	httpapiRoot := filepath.Join(moduleRoot, "internal", "httpapi")
	allowedRoutes := map[string]string{
		"/livez":                  filepath.Join(moduleRoot, "internal", "httpapi", "handler.go"),
		"/readyz":                 filepath.Join(moduleRoot, "internal", "httpapi", "handler.go"),
		"/metrics":                filepath.Join(moduleRoot, "internal", "httpapi", "handler.go"),
		"/api/v1/images/bangumi/": filepath.Join(moduleRoot, "internal", "httpapi", "handler.go"),
		"/api/v1/catalog":         filepath.Join(moduleRoot, "internal", "httpapi", "catalog_handler.go"),
		"/api/v1/rankings":        filepath.Join(moduleRoot, "internal", "httpapi", "rankings_handler.go"),
	}
	routeCounts := make(map[string]int, len(allowedRoutes))
	err := filepath.WalkDir(moduleRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".cache", ".tmp":
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") || strings.HasSuffix(path, "query_wire.gen.go") {
			return nil
		}

		tree, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		ast.Inspect(tree, func(node ast.Node) bool {
			literal, ok := node.(*ast.BasicLit)
			if ok && literal.Kind == token.STRING && filepath.Dir(path) == httpapiRoot {
				var value string
				if err := json.Unmarshal([]byte(literal.Value), &value); err == nil &&
					(strings.HasPrefix(value, "/api/") ||
						value == "/livez" ||
						value == "/readyz" ||
						value == "/metrics") {
					expectedPath, allowed := allowedRoutes[value]
					if !allowed {
						t.Errorf("unapproved production route/path literal %q: %s", value, path)
					} else if path != expectedPath {
						t.Errorf("runtime route %q appears outside handler: %s", value, path)
					} else {
						routeCounts[value]++
					}
				}
			}
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			selector, ok := call.Fun.(*ast.SelectorExpr)
			if ok && (selector.Sel.Name == "Handle" || selector.Sel.Name == "HandleFunc") {
				t.Errorf("unreviewed route registration API is forbidden: %s", path)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatalf("walk production Go files: %v", err)
	}
	for route := range allowedRoutes {
		if routeCounts[route] != 1 {
			t.Errorf("runtime route %q literal count = %d, want 1", route, routeCounts[route])
		}
	}
}

func TestNoNestedModulesWorkspacesOrVendorTrees(t *testing.T) {
	moduleRoot := findModuleRoot(t)
	repositoryRoot := filepath.Dir(moduleRoot)
	approvedModule := filepath.Join(moduleRoot, "go.mod")

	err := filepath.WalkDir(repositoryRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", ".cache", ".tmp", "node_modules":
				return filepath.SkipDir
			case "vendor":
				t.Errorf("vendor tree is forbidden: %s", path)
				return filepath.SkipDir
			}
			return nil
		}

		switch entry.Name() {
		case "go.mod":
			if path != approvedModule {
				t.Errorf("nested or root module is forbidden: %s", path)
			}
		case "go.work":
			t.Errorf("Go workspace is forbidden: %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk repository: %v", err)
	}
}

func findModuleRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve architecture test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func listPackages(t *testing.T, moduleRoot string) []listedPackage {
	t.Helper()
	command := exec.Command("go", "list", "-json", "./...")
	command.Dir = moduleRoot
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("go list ./...: %v\n%s", err, stderr.String())
	}

	decoder := json.NewDecoder(&stdout)
	var packages []listedPackage
	for {
		var pkg listedPackage
		if err := decoder.Decode(&pkg); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatalf("decode go list output: %v", err)
		}
		packages = append(packages, pkg)
	}
	if len(packages) == 0 {
		t.Fatal("go list returned no packages")
	}
	return packages
}

func pathWithin(root, path string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func mapsEqual(left, right map[string]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, value := range left {
		if right[key] != value {
			return false
		}
	}
	return true
}

func assertNoWorkbenchName(t *testing.T, pkg listedPackage) {
	t.Helper()
	if strings.Contains(strings.ToLower(pkg.ImportPath), "workbench") {
		t.Errorf("production import path contains workbench: %s", pkg.ImportPath)
	}
	if strings.Contains(strings.ToLower(pkg.Name), "workbench") {
		t.Errorf("production package name contains workbench: %s", pkg.Name)
	}
	for _, filename := range append(slices.Clone(pkg.GoFiles), pkg.CgoFiles...) {
		if strings.Contains(strings.ToLower(filename), "workbench") {
			t.Errorf("production filename contains workbench: %s: %s", pkg.ImportPath, filename)
		}
	}
}

func (e listError) Error() string {
	return fmt.Sprintf("go list: %s", e.Err)
}
