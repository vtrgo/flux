package notifications

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// IssueNotification represents a normalized issue event payload to be delivered
// across any registered notification channels.
type IssueNotification struct {
	DefectID       uuid.UUID
	MachineID      uuid.UUID
	MachineNumber  string
	Description    string
	Severity       string
	AssignedDept   string
	RecipientEmail string
	OpenedByName   string
	DateOpened     time.Time
	DueDate        *time.Time
	Timezone       string
}

// Channel defines the standard contract for any notification transport method.
type Channel interface {
	Name() string
	IsEnabled() bool
	SendIssueNotification(ctx context.Context, notif IssueNotification) error
}
