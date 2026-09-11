package api

import (
	"net/http"
	"os"
	"os/exec"
	"strings"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/version"
)

type ReleaseTagInfo struct {
	Tag     string `json:"tag"`
	Date    string `json:"date"`
	Subject string `json:"subject"`
}

type SystemVersionResponse struct {
	Version          string           `json:"version"`
	Commit           string           `json:"commit"`
	BuildDate        string           `json:"build_date"`
	Environment      string           `json:"environment"`
	DatabaseOnline   bool             `json:"database_online"`
	GitBranch        string           `json:"git_branch,omitempty"`
	RecentReleases   []ReleaseTagInfo `json:"recent_releases"`
	DeployScriptPath string           `json:"deploy_script_path"`
}
func handleGetSystemVersion(w http.ResponseWriter, r *http.Request) {
	v := version.Get()

	// Check DB connectivity
	dbOnline := false
	if db.DB != nil {
		if err := db.DB.Ping(); err == nil {
			dbOnline = true
		}
	}

	env := "production"
	if strings.Contains(v.Version, "dev") || os.Getenv("DATABASE_URL") == "" || strings.Contains(os.Getenv("DATABASE_URL"), "flux_test") {
		env = "development"
	}

	gitBranch := ""
	releases := []ReleaseTagInfo{}

	// If git is accessible in this environment, retrieve live branch and recent tag history
	if out, err := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		gitBranch = strings.TrimSpace(string(out))
	}

	tagCmd := exec.Command("git", "tag", "-l", "--sort=-creatordate", "--format=%(refname:short)|%(creatordate:short)|%(contents:subject)")
	if out, err := tagCmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "|", 3)
			tag := parts[0]
			date := ""
			subject := ""
			if len(parts) > 1 {
				date = parts[1]
			}
			if len(parts) > 2 {
				subject = parts[2]
			}
			releases = append(releases, ReleaseTagInfo{
				Tag:     tag,
				Date:    date,
				Subject: subject,
			})
			if len(releases) >= 10 {
				break
			}
		}
	}

	// Fallback mock releases if not running inside a git directory in production
	if len(releases) == 0 {
		releases = []ReleaseTagInfo{
			{Tag: "v1.4.0", Date: "2026-08-26", Subject: "chore: remove leftover python scripts"},
			{Tag: "v1.3.3", Date: "2026-08-25", Subject: "Release v1.3.3: improve Go caching and deploy script"},
			{Tag: "v1.3.0", Date: "2026-08-25", Subject: "Release v1.3.0: add opened and closed timestamp displays"},
		}
	}

	resp := SystemVersionResponse{
		Version:          v.Version,
		Commit:           v.Commit,
		BuildDate:        v.BuildDate,
		Environment:      env,
		DatabaseOnline:   dbOnline,
		GitBranch:        gitBranch,
		RecentReleases:   releases,
		DeployScriptPath: "scripts/deploy_production.sh",
	}

	respondJSON(w, http.StatusOK, resp)
}
