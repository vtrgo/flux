package version

// Build-time variables injected via -ldflags
var (
	Version   = "v1.5.7"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// Info represents the runtime version metadata
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
}

// Get returns the current version info
func Get() Info {
	return Info{
		Version:   Version,
		Commit:    Commit,
		BuildDate: BuildDate,
	}
}
